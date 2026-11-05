# SPDX-License-Identifier: LicenseRef-HILiT-NCA-1.1
# 평가용 실제 선수 자르기(개발 영상만, 봉인 제외). 분석 화면 해상도로 디코드(제품과 같은 크기).
import json, subprocess, random, sys
from PIL import Image, ImageDraw
random.seed(7)
import os
R=os.environ.get('ARTIFACTS','artifacts')
clips={c['id']:c['clipFile'] for c in json.load(open(R+'/sam2/clips.json',encoding='utf8'))}
dump=json.load(open(R+'/sam2/dump.json',encoding='utf8'))
import os
SEALED=set(os.environ.get('SEALED_IDS','').split(','))
PER=int(sys.argv[1]) if len(sys.argv)>1 else 26
meta=[]; crops=[]
for o in dump:
    vid=o['id']
    if vid in SEALED or not vid.startswith('fb') or not o.get('debugSamples'): continue
    W,H=o['metaDump']['width'],o['metaDump']['height']
    cand=[]
    for s in o['debugSamples']:
        for d in s['dets']:
            if d['height']>=70 and d['score']>=0.4: cand.append((s['t'],d))
    random.shuffle(cand); pick=sorted(cand[:PER],key=lambda x:x[0])
    for t,d in pick:
        raw=subprocess.run(['ffmpeg','-v','error','-ss',f'{t:.3f}','-i',clips[vid],'-frames:v','1','-vf',f'scale={W}:{H}:flags=bicubic:in_color_matrix=bt709','-f','rawvideo','-pix_fmt','rgb24','-'],capture_output=True).stdout
        if len(raw)<W*H*3: continue
        im=Image.frombytes('RGB',(W,H),raw[:W*H*3])
        b=(int(d['x']),int(d['y']),int(d['x']+d['width']),int(d['y']+d['height']))
        c=im.crop(b); crops.append(c); meta.append({'vid':vid,'t':t,'box':[d['x'],d['y'],d['width'],d['height']]})
    print(vid,len(pick),flush=True)
json.dump(meta,open('real-meta.json','w'))
for i,c in enumerate(crops): c.save(f'real/{i:04d}.png')
# 판독용 시트: 칸당 키 200, 6x4
for sh in range(0,len(crops),24):
    cells=crops[sh:sh+24]; CW,CH=140,230
    S=Image.new('RGB',(CW*6,CH*4),'white'); dr=ImageDraw.Draw(S)
    for k,c in enumerate(cells):
        cc=c.resize((max(1,int(c.width*200/c.height)),200)); 
        if cc.width>CW-4: cc=cc.resize((CW-4,int(cc.height*(CW-4)/cc.width)))
        x,y=(k%6)*CW,(k//6)*CH; S.paste(cc,(x+2,y+24)); dr.text((x+4,y+4),str(sh+k),fill='red')
    S.save(f'sheet-{sh//24:02d}.png')
print('total',len(crops))
