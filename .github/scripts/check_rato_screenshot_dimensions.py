"""Check candidate screenshot PNG headers; a human must review the pixels."""
from pathlib import Path
import struct
import sys

SIZES = {
    'iphone': {(1179, 2556), (1206, 2622)},
    'ipad': {(2064, 2752), (2048, 2732)},
}
PNG_HEADER = b'\x89PNG\r\n\x1a\n'


def inspect_png(path, kind):
    with path.open('rb') as screenshot:
        header = screenshot.read(33)
    if len(header) != 33 or header[:8] != PNG_HEADER or header[12:16] != b'IHDR':
        raise ValueError(f'{path.name}: invalid PNG header')
    width, height = struct.unpack('>II', header[16:24])
    if (width, height) not in SIZES[kind]:
        raise ValueError(f'{path.name}: unexpected size {width} x {height}')
    # Types 4 and 6 contain alpha. Color type 3 may contain a tRNS alpha chunk;
    # do not claim files without type 4/6 are alpha-free without full inspection.
    return width, height, header[25]


def verify_directory(directory):
    for kind in SIZES:
        for delay in ('25s', '45s'):
            file = directory / f'{kind}-{delay}.png'
            width, height, color_type = inspect_png(file, kind)
            print(f'{file.name}: {width} x {height}; PNG color type {color_type}; review content and alpha manually')


if __name__ == '__main__':
    try:
        verify_directory(Path(sys.argv[1]))
    except (OSError, ValueError) as error:
        sys.exit(str(error))
