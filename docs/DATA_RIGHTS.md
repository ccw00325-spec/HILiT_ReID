# 자료 권리 기준

이 저장소의 코드를 학습이나 평가에 쓸 때 자료의 권리는 이용자가 직접 확인해야 합니다. 저작자가 지키는 기준은 다음과 같습니다. 법률 자문이 아닙니다.

## 저작자가 쓰지 않는 것

- 연구·비상업 전용 Re-ID 데이터셋과 그것으로 학습한 가중치 (Market-1501, DukeMTMC-reID, MSMT17, CUHK03, MOT17/20, SoccerNet 계열)
- ImageNet 사전학습 가중치, SVHN
- AGPL 코드와 모델을 제품에 넣는 일
- 기계가 만든 라벨을 학습 정답으로 쓰는 일
- 얼굴 인식, 생체 특징 저장, 여러 영상에 걸친 사람 검색

## 이용자가 확인할 것

1. 코드, 가중치, 학습 자료, 변환 도구 각각의 라이선스
2. 영상 속 사람의 동의와 초상권, 개인정보 관련 법령
3. 학습 정답을 누가 만들었는지

`research/jersey/gen.py` 는 글꼴을 포함하지 않습니다. 사용 허가가 분명한 글꼴(SIL OFL, Bitstream Vera)을 직접 준비해 `RESEARCH_DEPS` 로 지정해야 합니다.

영상, 자른 그림, 임베딩, 가중치는 이 저장소에 없습니다.

## English

You must check the rights of any data you use with this code. The author does not use research-only Re-ID datasets, ImageNet-pretrained weights, machine-made labels as training truth, face recognition, or cross-video person search.
