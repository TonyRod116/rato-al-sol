"""Heuristic for blank Google map tiles in emulator PNGs, not a visual review."""
import struct
import zlib
from collections import Counter


def map_coverage(png):
    if not png.startswith(b'\x89PNG\r\n\x1a\n'):
        raise ValueError('Not a PNG image')
    offset, parts, dimensions = 8, [], None
    while offset + 12 <= len(png):
        length = int.from_bytes(png[offset:offset+4], 'big')
        kind = png[offset+4:offset+8]
        data = png[offset+8:offset+8+length]
        if len(data) != length:
            raise ValueError('Incomplete PNG chunk')
        if kind == b'IHDR':
            dimensions = struct.unpack('>IIBBBBB', data)
        elif kind == b'IDAT':
            parts.append(data)
        elif kind == b'IEND':
            break
        offset += 12 + length
    if not dimensions or not parts:
        raise ValueError('Incomplete PNG')
    width, height, depth, color, compression, filtering, interlace = dimensions
    if (depth, color, compression, filtering, interlace) != (8, 6, 0, 0, 0) or width * height > 10_000_000:
        raise ValueError('Unexpected screenshot format')
    stride = width * 4
    raw = zlib.decompress(b''.join(parts))
    if len(raw) != height * (stride + 1):
        raise ValueError('Unexpected PNG scanline size')
    sample_x = [round(width * (.25 + i * .5 / 11)) for i in range(12)]
    sample_y = {round(height * (.20 + j * .35 / 11)) for j in range(12)}
    previous = bytearray(stride)
    colors = Counter()
    total = 0
    for y in range(max(sample_y) + 1):
        start = y * (stride + 1)
        kind = raw[start]
        row = bytearray(raw[start+1:start+1+stride])
        if kind == 1:
            for i in range(4, stride):
                row[i] = (row[i] + row[i-4]) & 255
        elif kind == 2:
            for i in range(stride):
                row[i] = (row[i] + previous[i]) & 255
        elif kind == 3:
            for i in range(stride):
                row[i] = (row[i] + ((row[i-4] if i >= 4 else 0) + previous[i]) // 2) & 255
        elif kind == 4:
            for i in range(stride):
                a = row[i-4] if i >= 4 else 0
                b = previous[i]
                c = previous[i-4] if i >= 4 else 0
                p = a + b - c
                pa, pb, pc = abs(p-a), abs(p-b), abs(p-c)
                predictor = a if pa <= pb and pa <= pc else b if pb <= pc else c
                row[i] = (row[i] + predictor) & 255
        elif kind != 0:
            raise ValueError('Unknown PNG filter')
        if y in sample_y:
            for x in sample_x:
                pixel = row[x*4:x*4+3]
                colors[tuple(pixel[i] // 16 for i in range(3))] += 1
                total += 1
        previous = row
    # No assumed tile background: lighting or shadows can change its color.
    # Reject featureless images and known sparse/partially loaded captures.
    if len(colors) < 14:
        return 0.0
    return 1 - colors.most_common(1)[0][1] / total

