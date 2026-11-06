#!/usr/bin/env python3
"""Print only component and permission metadata from a decoded Android manifest.

The manifest may contain a Maps key in meta-data. Never print XML, metadata
values, arbitrary exception messages, or intent extras.
"""
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ANDROID = '{http://schemas.android.com/apk/res/android}'
SAFE = re.compile(r'^[A-Za-z0-9_.$:|/-]{1,200}$')
INTERESTING = {
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_LOCATION',
    'android.permission.RECEIVE_BOOT_COMPLETED',
    'android.permission.WAKE_LOCK',
    'android.permission.ACCESS_BACKGROUND_LOCATION',
}


def clean(value):
    return value if value and SAFE.fullmatch(value) else '(none)'


def inspect(root):
    result = []
    for element in root:
        if element.tag in ('uses-permission', 'uses-permission-sdk-23'):
            permission = element.get(ANDROID + 'name', '')
            if permission in INTERESTING:
                result.append('permission ' + permission)
    app = root.find('application')
    if app is None:
        raise ValueError('Missing application')
    for kind in ('service', 'receiver'):
        for component in app.findall(kind):
            name = clean(component.get(ANDROID + 'name'))
            exported = clean(component.get(ANDROID + 'exported'))
            enabled = clean(component.get(ANDROID + 'enabled'))
            service_type = clean(component.get(ANDROID + 'foregroundServiceType'))
            line = f'{kind} {name} exported={exported} enabled={enabled}'
            if kind == 'service':
                line += f' foregroundType={service_type}'
            result.append(line)
    return result


def main():
    if len(sys.argv) != 2:
        print('Usage: inspect-components.py decoded-manifest.xml', file=sys.stderr)
        return 2
    try:
        root = ET.parse(Path(sys.argv[1])).getroot()
        for line in inspect(root):
            print(line)
    except (ET.ParseError, ValueError, OSError):
        print('Could not inspect the manifest', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
