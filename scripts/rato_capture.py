"""Create provisional screenshots from the actual Android app in CI.

This script targets only an isolated Android emulator.  It never uploads
screenshots to a store; the resulting images need a visual review first.
"""
from __future__ import annotations

import argparse
import re
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from png_map_check import map_coverage

PACKAGE = "com.ratoalsol.app"
BOUNDS = re.compile(r"^\[(\d+),(\d+)]\[(\d+),(\d+)]$")


def adb(*args: str, timeout: int = 30) -> bytes:
    return subprocess.run(
        ["adb", "-s", "emulator-5554", *args],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
    ).stdout


def snapshot() -> ET.Element:
    adb("shell", "uiautomator", "dump", "/sdcard/rato-window.xml", timeout=45)
    raw = adb("exec-out", "cat", "/sdcard/rato-window.xml")
    return ET.fromstring(raw)


def node_text(node: ET.Element) -> str:
    return " ".join((node.get("text", ""), node.get("content-desc", ""))).strip()


def find_node(root: ET.Element, needle: str) -> ET.Element | None:
    needle = needle.casefold()
    for node in root.iter("node"):
        if needle in node_text(node).casefold() and BOUNDS.match(node.get("bounds", "")):
            return node
    return None


def center(node: ET.Element) -> tuple[int, int]:
    match = BOUNDS.match(node.get("bounds", ""))
    if match is None:
        raise ValueError("El elemento no tiene límites utilizables")
    x1, y1, x2, y2 = (int(value) for value in match.groups())
    if x2 <= x1 or y2 <= y1:
        raise ValueError("El elemento tiene límites vacíos")
    return (x1 + x2) // 2, (y1 + y2) // 2


def tap(node: ET.Element) -> None:
    x, y = center(node)
    adb("shell", "input", "tap", str(x), str(y))


def wait_for(needle: str, seconds: int = 120) -> ET.Element:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        try:
            root = snapshot()
        except (ET.ParseError, subprocess.TimeoutExpired, subprocess.CalledProcessError):
            time.sleep(3)
            continue
        if find_node(root, needle) is not None:
            return root
        time.sleep(3)
    raise TimeoutError(f"No apareció el control esperado: {needle}")


def wait_until_no_busy(seconds: int = 120) -> ET.Element:
    waiting = (
        "calculando sombras", "actualizando sombras", "cargando edificios",
        "cargando alturas", "buscando tu ubicación", "preparando el mapa",
        "consultando edificios", "actualizando edificios",
    )
    failures = (
        "no se han podido dibujar las sombras", "no se han podido descargar los edificios",
        "no se ha podido cargar el mapa", "es de noche a esta hora",
    )
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        try:
            root = snapshot()
        except (ET.ParseError, subprocess.TimeoutExpired, subprocess.CalledProcessError):
            time.sleep(3)
            continue
        text = " ".join(node_text(node) for node in root.iter("node")).casefold()
        if any(word in text for word in failures):
            raise RuntimeError("La aplicación muestra un aviso que impide usar la captura")
        if not any(word in text for word in waiting):
            return root
        time.sleep(4)
    raise TimeoutError("La app siguió mostrando que estaba cargando")


def screenshot(path: Path) -> None:
    image = adb("exec-out", "screencap", "-p", timeout=45)
    if not image.startswith(b"\x89PNG\r\n\x1a\n") or len(image) < 10_000:
        raise ValueError("La captura no parece un PNG válido de la aplicación")
    path.write_bytes(image)


def wait_for_complete_map(path: Path, seconds: int = 240) -> None:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        image = adb("exec-out", "screencap", "-p", timeout=45)
        score = map_coverage(image)
        print(f"Map tile heuristic: {score:.0%}; still requires visual inspection.", flush=True)
        if score >= .97:
            check_map_authorization()
            wait_until_no_busy()
            # Recheck the exact image saved after any UI change during the wait.
            image = adb("exec-out", "screencap", "-p", timeout=45)
            if map_coverage(image) >= .97:
                path.write_bytes(image)
                return
        time.sleep(20)
    raise TimeoutError("El mapa no llegó a completar las teselas en el tiempo previsto")


def check_map_authorization() -> None:
    # Do not print logcat: Google may include the API key in its diagnostics.
    logs = adb("logcat", "-d", "-t", "3000", timeout=45).decode("utf-8", "replace").casefold()
    failures = ("authorization failure", "authorization failed", "api project is not authorized")
    if any(message in logs for message in failures):
        raise RuntimeError("El mapa ha informado un posible fallo de autorización")
    print("Sin fallo explícito de autorización en el registro reciente; el mapa requiere revisión visual.")


def set_midday(root: ET.Element) -> None:
    slider = find_node(root, "Hora para consultar el sol")
    if slider is None:
        raise RuntimeError("No se encontró el selector de hora accesible")
    match = BOUNDS.match(slider.get("bounds", ""))
    if match is None:
        raise RuntimeError("El selector de hora no tiene límites utilizables")
    x1, y1, x2, y2 = (int(value) for value in match.groups())
    if x2 - x1 < 150 or y2 <= y1:
        raise RuntimeError("El selector de hora tiene un tamaño inesperado")
    # El selector representa 06–22. Su punto del 37,5 % corresponde a las 12.
    inset = min(30, (x2 - x1) // 10)
    x = round(x1 + inset + (x2 - x1 - 2 * inset) * 0.375)
    y = (y1 + y2) // 2
    adb("shell", "input", "tap", str(x), str(y))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--activity", required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"[A-Za-z0-9_.$]+", args.activity):
        raise ValueError("La actividad de Android no es válida")
    args.output.mkdir(parents=True, exist_ok=True)
    try:
        # Ubicación ficticia de la Puerta del Sol, no la ubicación de Tony.
        adb("emu", "geo", "fix", "-3.7038", "40.4168")
        for permission in ("ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION"):
            adb("shell", "pm", "grant", PACKAGE, f"android.permission.{permission}")
        adb("shell", "am", "start", "-W", "-n", f"{PACKAGE}/{args.activity}", timeout=90)
        root = wait_for("Hora para consultar el sol")
        set_midday(root)
        check_map_authorization()
        wait_for_complete_map(args.output / "01-explorar-provisional.png")

        # El área central superior es el mapa en este teléfono de 1080 × 1920.
        # Comprobamos la selección real antes de guardar la siguiente captura.
        adb("shell", "input", "tap", "540", "500")
        wait_for("Punto elegido en el mapa", seconds=90)
        wait_until_no_busy()
        wait_for_complete_map(args.output / "02-punto-provisional.png")
        print("Capturas provisionales obtenidas; requieren revisión visual.")
    except Exception:
        try:
            screenshot(args.output / "diagnostico-no-publicar.png")
        except Exception:
            pass
        raise


if __name__ == "__main__":
    main()

