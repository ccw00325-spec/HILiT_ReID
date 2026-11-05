# 시도와 결론 요약

같은 유니폼과 화면 밖 재등장에서 다른 사람으로 착각하는 문제를 줄이려고 한 실험입니다. 평가는 비공개 실사 자료로 했고 그 자료는 공개하지 않습니다. 평가 정답은 기계가 만든 것이 포함되어 있어 학습에 쓰지 않았습니다.

| 시도 | 결론 |
|---|---|
| 함께 보인 사람을 비교에서 빼기 | 다른 사람으로 잇는 일이 늘어 뺐습니다 |
| 1·2등 점수 차이 규칙 | 대상이 없는데 있다고 하는 일이 늘어 뺐습니다 |
| 영상 안 색 가중 학습 | 진짜 대상을 1등으로 찾는 비율이 줄어 뺐습니다 |
| 영상 안 자기지도 CNN (`research/selfsup/`) | 영상 한 편 분량으로는 색 기준보다 못해 뺐습니다 |
| 상체 무늬 | 효과가 부족해 뺐습니다 |
| 합성 자료만으로 학습한 등번호 판독 (`research/jersey/`) | 실제와 차이가 크고 느려서 뺐습니다 |
| 위치 연속성 | 차이가 거의 없어 뺐습니다 |
| 급변 감지와 잇기 전 묻기 | 다른 사람으로 잇는 일이 줄어 기준을 통과했습니다. 대신 놓침과 묻기가 늘어 제품에는 꺼 둔 선택지로 넣었습니다 |

## 결론

- 같은 유니폼끼리는 색과 윤곽 같은 손으로 만든 특징으로 가를 수 없었습니다.
- 지금 쓸 수 있는 방법은 애매하면 잇지 않고 사용자에게 묻는 것입니다.
- 근본 해법은 사람이 만든 정답으로 학습한 판별기입니다. 정답 자료와 권리가 먼저 필요합니다.

## 다음 실험

1. `lab/robust-appearance.mjs` 를 동의받은 실제 영상과 사람 정답으로 재기. 합성 결과만으로 제품에 넣지 않습니다.
2. 조명 보정이 같은 옷이 없는 장면에서 다른 사람 수락을 늘리는 문제 줄이기.
3. 사용자에게 묻는 횟수의 허용 상한을 정하고 그 안에서 값 고르기.

## 참고 연구

생각만 참고했으며 코드와 가중치는 쓰지 않았습니다: Li 등 TAUDL(ECCV 2018), UTAL(TPAMI 2019), Hermans 등(2017), Sun 등 PCB(ECCV 2018), Zhong 등 Random Erasing(AAAI 2020), Gerke 등(ICCVW 2015), Koshkina & Elder(CVPRW 2024), Zhang 등 ByteTrack(ECCV 2022), Aharon 등 BoT-SORT(2022). 특허 비침해를 보증하지 않습니다.

## English

Summary of experiments on same-uniform confusion and re-entry. Hand-crafted features could not separate identical uniforms, and a per-video self-supervised CNN did not beat color. The practical approach today is to ask the user when unsure. The private evaluation data is not published.
