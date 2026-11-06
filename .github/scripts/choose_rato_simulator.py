"""Choose an available 26.x iOS simulator without relying on a runner UDID."""
import json
import re
import sys


def choose_device(data, name):
    candidates = []
    for runtime, devices in data.get('devices', {}).items():
        match = re.fullmatch(r'com\.apple\.CoreSimulator\.SimRuntime\.iOS-(\d+)-(\d+)', runtime)
        if not match or int(match.group(1)) != 26:
            continue
        for device in devices:
            if device.get('name') == name and device.get('isAvailable') and device.get('state') == 'Shutdown':
                candidates.append(((int(match.group(1)), int(match.group(2))), device['udid']))
    if not candidates:
        raise ValueError(f'No available shut down simulator for {name} on iOS 26')
    return max(candidates)[1]


if __name__ == '__main__':
    with open(sys.argv[1], encoding='utf-8') as source:
        inventory = json.load(source)
    try:
        print(choose_device(inventory, sys.argv[2]))
    except ValueError as error:
        sys.exit(str(error))
