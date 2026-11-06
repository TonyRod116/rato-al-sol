import hashlib,io,plistlib,re,sys,zipfile
def inspect(path):
    with zipfile.ZipFile(path) as z:
        files=[x for x in z.infolist() if not x.is_dir() and x.filename.endswith('.ipa')]
        assert len(files)==1
        contents=z.read(files[0])
    with zipfile.ZipFile(io.BytesIO(contents)) as ipa:
        names=ipa.namelist()
        info_name=next(n for n in names if re.fullmatch(r'Payload/[^/]+\.app/Info\.plist',n))
        root=info_name[:-len('Info.plist')]
        info=plistlib.loads(ipa.read(info_name))
        found={}
        markers={}
        for name in names:
            if not name.startswith(root) or name.endswith('/'):continue
            with ipa.open(name) as f:head=f.read(4)
            is_macho=head in (b'\xcf\xfa\xed\xfe',b'\xce\xfa\xed\xfe',b'\xfe\xed\xfa\xcf',b'\xfe\xed\xfa\xce',b'\xca\xfe\xba\xbe',b'\xbe\xba\xfe\xca',b'\xca\xfe\xba\xbf',b'\xbf\xba\xfe\xca')
            is_bundle=name.endswith(('.jsbundle','.hbc'))
            if not (is_macho or is_bundle):continue
            data=ipa.read(name)
            short=name[len(root):]
            found[short]=(len(data),hashlib.sha256(data).hexdigest(),is_macho)
            if is_bundle:
                terms=['node-forge','crypto-js','crypto-browserify','tweetnacl','libsodium','noble-curves','sjcl','createCipheriv','EVP_Encrypt','AES-GCM','AES-CBC']
                markers[short]=[t for t in terms if t.encode('ascii').lower() in data.lower()]
        return info.get('CFBundleVersion'),found,markers
a, old, om=inspect(sys.argv[1]);b,new,nm=inspect(sys.argv[2])
print('builds_compared:',a,b)
for k in sorted(set(old)|set(new)):
    if k not in old: print('ADDED',k)
    elif k not in new: print('REMOVED',k)
    else:
        print('EQUAL' if old[k][1]==new[k][1] else 'DIFFERENT',k,'native_macho' if old[k][2] else 'JS_BUNDLE',old[k][0],new[k][0])
print('js_crypto_markers_v23:',om)
print('js_crypto_markers_v24:',nm)
print('LIMIT: identical native binary bytes prove only that binaries match; different JS and literal checks do not establish functional or legal equivalence.')
