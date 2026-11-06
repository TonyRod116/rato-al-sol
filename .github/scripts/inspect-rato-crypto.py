import io
import os
import re
import struct
import sys
import zipfile
from collections import Counter

with zipfile.ZipFile(sys.argv[1]) as artifact:
    entries = [x for x in artifact.infolist() if not x.is_dir()]
    if len(entries) != 1 or entries[0].filename != "rato-android-production.aab":
        raise SystemExit("Unexpected artifact structure")
    bundle_bytes = artifact.read(entries[0])
with zipfile.ZipFile(io.BytesIO(bundle_bytes)) as bundle:
    names = bundle.namelist()
    dexes = sorted(x for x in names if re.fullmatch(r"base/dex/classes(?:[0-9]+)?\.dex", x))
    if not dexes:
        raise SystemExit("No Android DEX files")
    defined, referenced, literals = set(), set(), set()
    for name in dexes:
        data = bundle.read(name)
        if not data.startswith(b"dex\n"):
            raise SystemExit("Invalid DEX header")
        u32 = lambda offset: struct.unpack_from("<I", data, offset)[0]
        strings_n, strings_off, types_n, types_off = (u32(x) for x in (56, 60, 64, 68))
        classes_n, classes_off = (u32(x) for x in (96, 100))
        def read_string(index):
            p = u32(strings_off + index * 4)
            while data[p] & 128:
                p += 1
            p += 1
            end = data.index(b"\x00", p)
            return data[p:end].decode("utf-8", errors="replace")
        ss = [read_string(i) for i in range(strings_n)]
        tt = [ss[u32(types_off + i * 4)] for i in range(types_n)]
        referenced.update(tt)
        defined.update(tt[u32(classes_off + i * 32)] for i in range(classes_n))
        literals.update(ss)
    patterns = {
        "okhttp": ("Lokhttp3/",),
        "okio": ("Lokio/",),
        "conscrypt": ("Lorg/conscrypt/", "Lcom/android/org/conscrypt/", "Lcom/google/android/gms/org/conscrypt/"),
        "bouncycastle": ("Lorg/bouncycastle/", "Lcom/android/org/bouncycastle/"),
        "tink": ("Lcom/google/crypto/tink/",),
        "androidx_security_crypto": ("Landroidx/security/crypto/",),
        "chromium": ("Lorg/chromium/net/",),
        "maps_sdk": ("Lcom/google/android/gms/maps/",),
        "javax_crypto": ("Ljavax/crypto/",),
        "java_security": ("Ljava/security/",),
        "javax_net_ssl": ("Ljavax/net/ssl/",),
    }
    print("dex_files:", len(dexes), "defined_classes:", len(defined))
    for label, prefixes in patterns.items():
        a = sum(x.startswith(prefixes) for x in defined)
        b = sum(x.startswith(prefixes) for x in referenced)
        print(label + ": defined=" + str(a) + " referenced_types=" + str(b))
    libs = sorted(set(os.path.basename(x) for x in names if x.startswith("base/lib/") and x.endswith(".so")))
    print("packaged_native_library_names:", ", ".join(libs))
    indicators = ["AES", "AES/GCM/NoPadding", "AES/CBC/PKCS5Padding", "RSA", "SHA-256", "TLS", "TLSv1.2", "TLSv1.3", "ChaCha20", "X25519"]
    print("exact_algorithm_string_literals:", ", ".join(s for s in indicators if s in literals) or "(none)")
    print("Note: defined classes, references, and strings establish static presence only, not execution or final legal classification.")
