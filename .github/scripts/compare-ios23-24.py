import hashlib,io,plistlib,re,struct,sys,zipfile
def signature_normalized(data):
    out=bytearray(data)
    def thin(off):
        magic=data[off:off+4]
        if magic in (b'\xcf\xfa\xed\xfe',b'\xce\xfa\xed\xfe'): endian='<'
        elif magic in (b'\xfe\xed\xfa\xcf',b'\xfe\xed\xfa\xce'):endian='>'
        else:raise ValueError('Unknown Mach-O')
        is64=magic in (b'\xcf\xfa\xed\xfe',b'\xfe\xed\xfa\xcf')
        count=struct.unpack_from(endian+'I',data,off+16)[0]
        pos=off+(32 if is64 else 28)
        for _ in range(count):
            cmd,size=struct.unpack_from(endian+'II',data,pos)
            if cmd==0x1d:
                sigoff,sigsize=struct.unpack_from(endian+'II',data,pos+8)
                if off+sigoff+sigsize>len(data):raise ValueError('Bad signature bounds')
                out[off+sigoff:off+sigoff+sigsize]=b'\0'*sigsize
            pos+=size
    magics={b'\xca\xfe\xba\xbe':('>',False),b'\xbe\xba\xfe\xca':('<',False),b'\xca\xfe\xba\xbf':('>',True),b'\xbf\xba\xfe\xca':('<',True)}
    if data[:4] in magics:
        endian,is64=magics[data[:4]];count=struct.unpack_from(endian+'I',data,4)[0]
        for i in range(count):
            offset=struct.unpack_from(endian+('Q' if is64 else 'I'),data,8+i*(32 if is64 else 20)+8)[0]
            thin(offset)
    else:thin(0)
    return hashlib.sha256(out).hexdigest()
def section_hashes(data):
    magic=data[:4]
    if magic in (b'\xcf\xfa\xed\xfe',b'\xce\xfa\xed\xfe'):endian='<'
    elif magic in (b'\xfe\xed\xfa\xcf',b'\xfe\xed\xfa\xce'):endian='>'
    else:return {'<fat-or-unknown>':'unavailable'}
    is64=magic in (b'\xcf\xfa\xed\xfe',b'\xfe\xed\xfa\xcf')
    if not is64:return {'<32bit>':'unavailable'}
    pos=32;count=struct.unpack_from(endian+'I',data,16)[0];result={}
    for _ in range(count):
        cmd,size=struct.unpack_from(endian+'II',data,pos)
        if cmd==0x19:
            nsects=struct.unpack_from(endian+'I',data,pos+64)[0]
            for i in range(nsects):
                p=pos+72+i*80
                sect=data[p:p+16].split(b'\0')[0].decode('ascii','replace')
                seg=data[p+16:p+32].split(b'\0')[0].decode('ascii','replace')
                length=struct.unpack_from(endian+'Q',data,p+40)[0]
                offset=struct.unpack_from(endian+'I',data,p+48)[0]
                if offset and offset+length<=len(data):
                    result[seg+','+sect]=hashlib.sha256(data[offset:offset+length]).hexdigest()
        pos+=size
    return result
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
            found[short]=(len(data),hashlib.sha256(data).hexdigest(),is_macho,signature_normalized(data) if is_macho else None,section_hashes(data) if is_macho else {})
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
        print('EQUAL' if old[k][1]==new[k][1] else 'DIFFERENT',k,'native_macho' if old[k][2] else 'JS_BUNDLE',old[k][0],new[k][0], 'same_without_signature='+str(old[k][3]==new[k][3]) if old[k][2] else '')
for k in sorted(set(old)&set(new)):
    if old[k][2] and old[k][3]!=new[k][3]:
        print('DIFFERENT_SECTIONS',k,sorted(x for x in set(old[k][4])|set(new[k][4]) if old[k][4].get(x)!=new[k][4].get(x)))
print('js_crypto_markers_v23:',om)
print('js_crypto_markers_v24:',nm)
print('LIMIT: identical native binary bytes prove only that binaries match; different JS and literal checks do not establish functional or legal equivalence.')
