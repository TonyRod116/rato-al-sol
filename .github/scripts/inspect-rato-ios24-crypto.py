import io, os, plistlib, re, struct, sys, zipfile
from collections import defaultdict
p=sys.argv[1]
with zipfile.ZipFile(p) as artifact:
    entries=[x for x in artifact.infolist() if not x.is_dir() and x.filename.lower().endswith('.ipa')]
    if len(entries)!=1: raise SystemExit('Artifact does not contain exactly one IPA')
    print('artifact_ipa_filename:',os.path.basename(entries[0].filename))
    ipa=zipfile.ZipFile(io.BytesIO(artifact.read(entries[0])))
    names=ipa.namelist()
    top_plists=[n for n in names if re.fullmatch(r'Payload/[^/]+\.app/Info\.plist',n)]
    if len(top_plists)!=1: raise SystemExit('Expected one app Info.plist')
    info=plistlib.loads(ipa.read(top_plists[0]))
    print('bundle_id:',info.get('CFBundleIdentifier'))
    print('build_number:',info.get('CFBundleVersion'))
    print('uses_non_exempt_encryption_plist:',info.get('ITSAppUsesNonExemptEncryption','not set'))
    app_root=top_plists[0][:-len('Info.plist')]
    main_executable=app_root+info['CFBundleExecutable']
    print('app_executable_present:',main_executable in names)
    def slices(data):
        if data[:4] in (b'\xcf\xfa\xed\xfe',b'\xce\xfa\xed\xfe'):
            return [(0,'<')]
        if data[:4] in (b'\xfe\xed\xfa\xcf',b'\xfe\xed\xfa\xce'):
            return [(0,'>')]
        magics={b'\xca\xfe\xba\xbe':('>',False),b'\xbe\xba\xfe\xca':('<',False),b'\xca\xfe\xba\xbf':('>',True),b'\xbf\xba\xfe\xca':('<',True)}
        if data[:4] not in magics:return []
        endian,is64=magics[data[:4]]; count=struct.unpack_from(endian+'I',data,4)[0]
        if count>32: raise ValueError('unexpected fat slices')
        result=[]
        for i in range(count):
            pos=8+i*(32 if is64 else 20)
            off=struct.unpack_from(endian+('Q' if is64 else 'I'),data,pos+8)[0]
            if data[off:off+4] in (b'\xcf\xfa\xed\xfe',b'\xce\xfa\xed\xfe'):result.append((off,'<'))
            elif data[off:off+4] in (b'\xfe\xed\xfa\xcf',b'\xfe\xed\xfa\xce'):result.append((off,'>'))
        return result
    def deps(data,off,endian):
        magic=data[off:off+4]; is64=magic in (b'\xcf\xfa\xed\xfe',b'\xfe\xed\xfa\xcf')
        ncmds=struct.unpack_from(endian+'I',data,off+16)[0]
        pos=off+(32 if is64 else 28); found=[]
        if ncmds>10000: raise ValueError('unexpected ncmds')
        for _ in range(ncmds):
            cmd,sz=struct.unpack_from(endian+'II',data,pos)
            if sz<8 or pos+sz>len(data):raise ValueError('invalid load command')
            if (cmd & 0x7fffffff) in (0x0c,0x18,0x1f,0x20,0x23):
                str_off=struct.unpack_from(endian+'I',data,pos+8)[0]
                if str_off>=sz:raise ValueError('invalid dylib name')
                found.append(data[pos+str_off:data.index(0,pos+str_off,pos+sz)].decode('utf8','replace'))
            pos+=sz
        return found
    markers={
        'openssl':b'OpenSSL','boringssl':b'BoringSSL','libcrypto':b'libcrypto',
        'EVP_Encrypt':b'EVP_Encrypt','EVP_Decrypt':b'EVP_Decrypt',
        'mbedtls':b'mbedtls','libsodium':b'libsodium','CryptoSwift':b'CryptoSwift',
        'CommonCrypto':b'CommonCrypto','CCCrypt':b'CCCrypt','CryptoKit':b'CryptoKit',
        'SecTrust':b'SecTrust','Security_framework':b'Security.framework',
        'RSA':b'RSA','AES':b'AES','SHA256':b'SHA256','TLS':b'TLS'
    }
    binaries=[]; global_deps=set(); hits=defaultdict(list)
    for name in names:
        if not name.startswith(app_root) or name.endswith('/'):continue
        meta=ipa.getinfo(name)
        if meta.file_size<4 or meta.file_size>400000000: continue
        with ipa.open(name) as f:head=f.read(4)
        if head not in (b'\xcf\xfa\xed\xfe',b'\xce\xfa\xed\xfe',b'\xfe\xed\xfa\xcf',b'\xfe\xed\xfa\xce',b'\xca\xfe\xba\xbe',b'\xbe\xba\xfe\xca',b'\xca\xfe\xba\xbf',b'\xbf\xba\xfe\xca'):continue
        data=ipa.read(name); paths=slices(data)
        if not paths:continue
        display=name[len(app_root):]
        binaries.append(display)
        for off,endian in paths:global_deps.update(deps(data,off,endian))
        for label,needle in markers.items():
            if needle.lower() in data.lower():hits[label].append(display)
    print('macho_binaries:',len(binaries))
    for n in sorted(binaries):print('BINARY',n)
    print('linked_library_count:',len(global_deps))
    for n in sorted(global_deps):print('LOAD',n)
    for k,v in sorted(hits.items()):print('MARKER',k,':',', '.join(sorted(v)))
    print('LIMIT: library names, Mach-O link references and byte literals do not prove execution, export classification, absence of static crypto, or third party vendor cryptography.')
