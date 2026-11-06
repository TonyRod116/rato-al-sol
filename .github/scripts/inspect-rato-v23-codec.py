import io, re, struct, sys, zipfile
artifact_path, jar_path = sys.argv[1:3]
with zipfile.ZipFile(artifact_path) as artifact:
    members=[i for i in artifact.infolist() if not i.is_dir()]
    if len(members)!=1 or members[0].filename!='rato-android-production.aab':
        raise SystemExit('Unexpected artifact structure')
    bundle_bytes=artifact.read(members[0])
with zipfile.ZipFile(io.BytesIO(bundle_bytes)) as bundle:
    dexes=sorted(n for n in bundle.namelist() if re.fullmatch(r'base/dex/classes(?:[0-9]+)?\.dex',n))
    if not dexes: raise SystemExit('No DEX files')
    codec=set()
    for name in dexes:
        data=bundle.read(name)
        if not data.startswith(b'dex\n'): raise SystemExit('Invalid DEX')
        u=lambda p:struct.unpack_from('<I',data,p)[0]
        ss,so,ts,to,cs,co=[u(p) for p in (56,60,64,68,96,100)]
        def string(i):
            off=u(so+4*i)
            while data[off]&128: off+=1
            off+=1
            return data[off:data.index(0,off)].decode('utf8','replace')
        types=[string(u(to+4*i)) for i in range(ts)]
        codec.update(types[u(co+32*i)] for i in range(cs) if types[u(co+32*i)].startswith('Lorg/apache/commons/codec/'))
    print('dex_codec_classes:',len(codec))
    print('dex_beider_morse_classes:',sum('/language/bm/' in n for n in codec))
    with zipfile.ZipFile(jar_path) as jar:
        expected={'L'+n[:-6]+';' for n in jar.namelist() if n.startswith('org/apache/commons/codec/') and n.endswith('.class')}
        print('reference_1.10_classes:',len(expected))
        print('dex_only:', sorted(codec-expected))
        print('jar_1.10_only:', sorted(expected-codec))
        print('name_sets_equal:',codec==expected)
        print('reference_1.10_notice_begin')
        print(jar.read('META-INF/NOTICE.txt').decode('utf8'))
        print('reference_1.10_notice_end')
    print('NOTE equal class names do not conclusively prove identical class implementation or dependency version.')
