import Foundation
import CoreGraphics
import ImageIO
import ExpoModulesCore

private enum ShadowRasterError: Error {
  case invalidInput, invalidPath, cancelled, storage, unavailable
}

// Determine how a bitmap context maps y=0 into the first encoded scanline.
// The supplied paths use a top-left origin (north at the top of the image).
private let topRowIsYZero: Bool = {
  var bytes = [UInt8](repeating: 0, count: 8)
  return bytes.withUnsafeMutableBytes { buffer in
    guard let context = CGContext(data: buffer.baseAddress, width: 1, height: 2,
      bitsPerComponent: 8, bytesPerRow: 4, space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue) else { return true }
    context.setFillColor(red: 1, green: 0, blue: 0, alpha: 1)
    context.fill(CGRect(x: 0, y: 0, width: 1, height: 1))
    return buffer[3] != 0
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
      try self.checkActive(id)
      guard width > 0, height > 0, width <= 768, height <= 768,
        shadow.utf8.count <= 4_000_000, roof.utf8.count <= 4_000_000,
        shadow.utf8.count + roof.utf8.count <= 6_000_000 else { throw ShadowRasterError.invalidInput }
      let target = try self.cacheTarget(destination)
      let shadowPath = try self.parsePath(shadow, id: id)
      let roofPath = try self.parsePath(roof, id: id)
      try self.checkActive(id)

      // Draw both paths once into a single transparent bitmap. Nonzero
      // winding preserves courtyards and overlapping shadows stay uniform.
      let scale = 2
      let pixelWidth = width * scale, pixelHeight = height * scale
      guard let context = CGContext(data: nil, width: pixelWidth, height: pixelHeight,
        bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue)
      else { throw ShadowRasterError.unavailable }
      if topRowIsYZero {
        context.scaleBy(x: CGFloat(scale), y: CGFloat(scale))
      } else {
        context.translateBy(x: 0, y: CGFloat(pixelHeight))
        context.scaleBy(x: CGFloat(scale), y: -CGFloat(scale))
      }
      context.setAllowsAntialiasing(true)
      context.setShouldAntialias(true)
      context.setFillColor(red: 48.0 / 255, green: 67.0 / 255, blue: 73.0 / 255, alpha: 0.26)
      context.addPath(shadowPath)
      context.drawPath(using: .fill)
      try self.checkActive(id)
      context.setBlendMode(.clear)
      context.addPath(roofPath)
      context.drawPath(using: .fill)
      try self.checkActive(id)
      guard let image = context.makeImage() else { throw ShadowRasterError.unavailable }
      let png = NSMutableData()
      guard let writer = CGImageDestinationCreateWithData(png as CFMutableData, "public.png" as CFString, 1, nil)
      else { throw ShadowRasterError.unavailable }
      CGImageDestinationAddImage(writer, image, nil)
      guard CGImageDestinationFinalize(writer) else { throw ShadowRasterError.storage }
      try self.checkActive(id)
      do {
        try Data(referencing: png).write(to: target, options: .atomic)
        try self.checkActive(id)
      } catch {
        try? FileManager.default.removeItem(at: target)
        throw error
      }
      return target.absoluteString
    }.runOnQueue(renderQueue)
  }

  private func checkActive(_ id: String) throws {
    jobsLock.lock()
    let active = jobs[id] == false
    jobsLock.unlock()
    if !active { throw ShadowRasterError.cancelled }
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

  // Input is the bounded, compact Mx,yLx,y...Z syntax generated by the app.
  // Never evaluate arbitrary SVG. Parsing also checks cancellation regularly.
  private func parsePath(_ input: String, id: String) throws -> CGPath {
    let bytes = Array(input.utf8)
    let path = CGMutablePath()
    var index = 0, count = 0, open = false, points = 0
    func number(untilComma: Bool) throws -> Double {
      let start = index
      while index < bytes.count {
        let c = bytes[index]
        if untilComma ? c == 44 : (c == 77 || c == 76 || c == 90) { break }
        index += 1
      }
      guard index > start, index - start <= 32,
        let value = Double(String(decoding: bytes[start..<index], as: UTF8.self)),
        value.isFinite, abs(value) <= 100_000_000 else { throw ShadowRasterError.invalidPath }
      return value
    }
    while index < bytes.count {
      if count % 1024 == 0 { try checkActive(id) }
      count += 1
      guard count <= 300_000 else { throw ShadowRasterError.invalidPath }
      let command = bytes[index]
      index += 1
      if command == 90 {
        guard open, points >= 3 else { throw ShadowRasterError.invalidPath }
        path.closeSubpath(); open = false; points = 0
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
    return path
  }
}
