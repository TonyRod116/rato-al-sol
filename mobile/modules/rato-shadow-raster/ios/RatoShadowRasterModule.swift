import Foundation
import CoreGraphics
import ImageIO
import ExpoModulesCore

private enum ShadowRasterError: Error {
  case invalidInput, invalidPath, cancelled, complexity, storage, unavailable
}

// Determine how a bitmap context maps y=0 into the first encoded scanline.
// The supplied paths use a top-left origin (north at the top of the image).
private let topRowIsYZero: Bool = {
  var bytes = [UInt8](repeating: 0, count: 32)
  return bytes.withUnsafeMutableBytes { buffer in
    guard let context = CGContext(data: buffer.baseAddress, width: 1, height: 2,
      bitsPerComponent: 8, bytesPerRow: 16, space: CGColorSpaceCreateDeviceGray(),
      bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return true }
    context.setFillColor(gray: 1, alpha: 1)
    context.fill(CGRect(x: 0, y: 0, width: 1, height: 1))
    return buffer[0] != 0
  }
}()

public final class RatoShadowRasterModule: Module {
  private let jobsLock = NSLock()
  private var jobs: [String: Bool] = [:] // Present while the unique job is active.
  private let renderQueue = DispatchQueue(label: "rato.shadow.raster", qos: .userInitiated)

  public func definition() -> ModuleDefinition {
    Name("RatoShadowRaster")

    // Registration happens before queuing the async job. Cancellation is
    // synchronous and can mark a queued or running job without waiting for
    // the background rendering queue.
    Function("register") { (id: String) -> Bool in
      guard !id.isEmpty, id.utf8.count <= 128 else { return false }
      self.jobsLock.lock()
      defer { self.jobsLock.unlock() }
      guard self.jobs[id] == nil, self.jobs.count < 64 else { return false }
      self.jobs[id] = false
      return true
    }

    Function("cancel") { (id: String) in
      self.jobsLock.lock()
      self.jobs.removeValue(forKey: id)
      self.jobsLock.unlock()
    }

    AsyncFunction("render") { (id: String, shadow: String, roof: String, width: Int, height: Int, destination: String) -> String in
      defer {
        self.jobsLock.lock()
        self.jobs.removeValue(forKey: id)
        self.jobsLock.unlock()
      }
      let deadline = ProcessInfo.processInfo.systemUptime + 6
      do {
        try self.checkActive(id, deadline: deadline)
        guard width > 0, height > 0, width <= 768, height <= 768 else { throw ShadowRasterError.invalidInput }
        guard shadow.utf8.count <= 4_000_000, roof.utf8.count <= 4_000_000,
          shadow.utf8.count + roof.utf8.count <= 6_000_000 else { throw ShadowRasterError.complexity }
        let target = try self.cacheTarget(destination)
        let shadowPaths = try self.parsePaths(shadow, id: id, deadline: deadline)
        let roofPaths = try self.parsePaths(roof, id: id, deadline: deadline)
        try self.checkActive(id, deadline: deadline)

        // Drawing one huge path forces Core Graphics to resolve intersections
        // between thousands of long shadows at once. Draw complete polygons
        // into an opaque mask instead: polygons are unioned, their holes remain
        // part of each path, and the colour/opacity is applied only once.
        let scale = 2
        let pixelWidth = width * scale, pixelHeight = height * scale
        let maskStride = (pixelWidth + 15) & ~15
        var mask = [UInt8](repeating: 0, count: maskStride * pixelHeight)
        try mask.withUnsafeMutableBytes { buffer in
          guard let context = CGContext(data: buffer.baseAddress, width: pixelWidth, height: pixelHeight,
            bitsPerComponent: 8, bytesPerRow: maskStride, space: CGColorSpaceCreateDeviceGray(),
            bitmapInfo: CGImageAlphaInfo.none.rawValue) else { throw ShadowRasterError.unavailable }
          if topRowIsYZero {
            context.scaleBy(x: CGFloat(scale), y: CGFloat(scale))
          } else {
            context.translateBy(x: 0, y: CGFloat(pixelHeight))
            context.scaleBy(x: CGFloat(scale), y: -CGFloat(scale))
          }
          context.setAllowsAntialiasing(true)
          context.setShouldAntialias(true)
          let visible = CGRect(x: -1, y: -1, width: CGFloat(width + 2), height: CGFloat(height + 2))
          func draw(_ paths: [CGPath], gray: CGFloat) throws {
            context.setFillColor(gray: gray, alpha: 1)
            for (index, path) in paths.enumerated() {
              if index % 16 == 0 { try self.checkActive(id, deadline: deadline) }
              if !path.boundingBoxOfPath.intersects(visible) { continue }
              context.addPath(path)
              context.drawPath(using: .fill)
            }
          }
          try draw(shadowPaths, gray: 1)
          try draw(roofPaths, gray: 0)
        }
        try self.checkActive(id, deadline: deadline)
        var rgba = [UInt8](repeating: 0, count: pixelWidth * pixelHeight * 4)
        for row in 0..<pixelHeight {
          if row % 16 == 0 { try self.checkActive(id, deadline: deadline) }
          for column in 0..<pixelWidth {
            let alpha = (Int(mask[row * maskStride + column]) * 66 + 127) / 255
            let index = (row * pixelWidth + column) * 4
            rgba[index] = UInt8((48 * alpha + 127) / 255)
            rgba[index + 1] = UInt8((67 * alpha + 127) / 255)
            rgba[index + 2] = UInt8((73 * alpha + 127) / 255)
            rgba[index + 3] = UInt8(alpha)
          }
        }
        guard let provider = CGDataProvider(data: Data(rgba) as CFData),
          let image = CGImage(width: pixelWidth, height: pixelHeight, bitsPerComponent: 8, bitsPerPixel: 32,
            bytesPerRow: pixelWidth * 4, space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue),
            provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent)
        else { throw ShadowRasterError.unavailable }
        let png = NSMutableData()
        guard let writer = CGImageDestinationCreateWithData(png as CFMutableData, "public.png" as CFString, 1, nil)
        else { throw ShadowRasterError.unavailable }
        CGImageDestinationAddImage(writer, image, nil)
        guard CGImageDestinationFinalize(writer) else { throw ShadowRasterError.storage }
        try self.checkActive(id, deadline: deadline)
        do {
          try Data(referencing: png).write(to: target, options: .atomic)
          try self.checkActive(id, deadline: deadline)
        } catch {
          try? FileManager.default.removeItem(at: target)
          throw error
        }
        return target.absoluteString
      } catch ShadowRasterError.complexity {
        // Explicitly distinguish an exhausted work budget from an ordinary
        // renderer failure, so JS does not start an equally expensive retry.
        return "rato-shadow-complexity"
      } catch ShadowRasterError.invalidPath {
        return "rato-shadow-geometry"
      }
    }.runOnQueue(renderQueue)
  }

  private func checkActive(_ id: String, deadline: TimeInterval) throws {
    jobsLock.lock()
    let active = jobs[id] == false
    jobsLock.unlock()
    if !active { throw ShadowRasterError.cancelled }
    if ProcessInfo.processInfo.systemUptime > deadline { throw ShadowRasterError.complexity }
  }

  // Native output is limited to uniquely named files in the app cache.
  private func cacheTarget(_ value: String) throws -> URL {
    guard let url = URL(string: value), url.isFileURL,
      url.lastPathComponent.hasPrefix("rato-native-shadow-"), url.pathExtension == "png",
      let root = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else {
      throw ShadowRasterError.invalidInput
    }
    let parent = url.deletingLastPathComponent().standardizedFileURL.resolvingSymlinksInPath().path
    let cache = root.standardizedFileURL.resolvingSymlinksInPath().path
    guard parent == cache || parent.hasPrefix(cache + "/") else { throw ShadowRasterError.invalidInput }
    return URL(fileURLWithPath: parent, isDirectory: true).appendingPathComponent(url.lastPathComponent)
  }

  // Each | separates complete polygons; holes remain in their parent path.
  // Never evaluate arbitrary SVG. Parsing also checks cancellation regularly.
  private func parsePaths(_ input: String, id: String, deadline: TimeInterval) throws -> [CGPath] {
    let bytes = Array(input.utf8)
    var paths: [CGPath] = [], path = CGMutablePath()
    var index = 0, count = 0, open = false, points = 0, rings = 0, groupCommands = 0
    func number(untilComma: Bool) throws -> Double {
      let start = index
      while index < bytes.count {
        let c = bytes[index]
        if untilComma ? c == 44 : (c == 77 || c == 76 || c == 90) { break }
        index += 1
      }
      guard index > start, index - start <= 32,
        let value = Double(String(decoding: bytes[start..<index], as: UTF8.self)),
        value.isFinite else { throw ShadowRasterError.invalidPath }
      // Implausibly large projected coordinates may make native clipping
      // disproportionately expensive. They cannot be safely simplified here.
      guard abs(value) <= 65_536 else { throw ShadowRasterError.complexity }
      return value
    }
    while index < bytes.count {
      if count % 1024 == 0 { try checkActive(id, deadline: deadline) }
      count += 1
      guard count <= 300_000 else { throw ShadowRasterError.complexity }
      let command = bytes[index]
      index += 1
      if command != 124 {
        groupCommands += 1
        guard groupCommands <= 1_024 else { throw ShadowRasterError.complexity }
      }
      if command == 90 {
        guard open, points >= 3 else { throw ShadowRasterError.invalidPath }
        path.closeSubpath(); open = false; points = 0; rings += 1
      } else if command == 124 {
        guard !open, rings > 0, index < bytes.count else { throw ShadowRasterError.invalidPath }
        paths.append(path); path = CGMutablePath(); rings = 0; groupCommands = 0
      } else if command == 77 || command == 76 {
        if command == 77 { guard !open else { throw ShadowRasterError.invalidPath } }
        else { guard open else { throw ShadowRasterError.invalidPath } }
        let x = try number(untilComma: true)
        guard index < bytes.count, bytes[index] == 44 else { throw ShadowRasterError.invalidPath }
        index += 1
        let y = try number(untilComma: false)
        if command == 77 { path.move(to: CGPoint(x: CGFloat(x), y: CGFloat(y))); open = true; points = 1 }
        else { path.addLine(to: CGPoint(x: CGFloat(x), y: CGFloat(y))); points += 1 }
      } else { throw ShadowRasterError.invalidPath }
    }
    guard !open else { throw ShadowRasterError.invalidPath }
    if rings > 0 { paths.append(path) }
    return paths
  }
}
