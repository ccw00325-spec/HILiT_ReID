<p align="center">
  <img src="assets/hilit-tec-banner.jpg" alt="AI Tec — Built for Real Work, Not Just Demos" width="100%">
</p>

# HILiT ReID

**사용자가 고른 사람을 영상 한 편 안에서 다시 확인하는 기술입니다.** 대상이 화면 밖에 나갔다 돌아오거나 같은 유니폼 선수와 겹칠 때, 다른 사람을 그 사람으로 착각하지 않도록 돕습니다. 확신이 없으면 추측하지 않고 사용자에게 묻는 것이 기본 원칙입니다.

> 외형 점수는 고른 대상이 맞는지 보는 보조 근거입니다. 신원 확률이 아닙니다. 사람 데이터베이스, 생체 정보 저장, 영상 간 사람 검색을 만들지 않으며 그런 용도로 쓸 수 없습니다.

> **비상업적 이용만 무료입니다.** 상업적으로 쓰려면 먼저 저작자의 서면 승인을 받아야 합니다: **ccw00325@gmail.com**
>
> 사용하거나 공개할 때는 **HILiT ReID**, **조찬우 (Chanwoo Cho)**, **https://github.com/ccw00325-spec/HILiT_ReID** 를 꼭 표시해 주세요. 자세한 조건은 [`LICENSE`](LICENSE) 에 있습니다.

## 바로 해 보기

Node.js 24 이상이면 설치할 것이 없습니다. 가중치와 영상도 필요 없습니다.

```bash
npm test          # 표시, 공개 안전, 실험 코드, 기준값 검사
npm run robust    # 조명, 번짐, 가림, 같은 유니폼 조건의 외형 비교 측정
```

## 무엇이 들어 있나

| 경로 | 내용 |
|---|---|
| `runtime/` | 외형 비교, 재획득 판정, 확실한 타인 기억의 제품 코드 사본 (웹, Android) |
| `lab/robust-appearance.mjs` | 실험: 조명 보정, 위아래 나눠 비교, 품질에 따라 더 자주 묻는 세 갈래 판단. **제품 미적용** |
| `eval/robustness.mjs` | 합성 조각으로 재는 강건성 시험. CI가 기준값과 비교합니다 |
| `eval/ask-sim.mjs`, `eval/reentry-bench.mjs` | 묻기 흉내와 재등장 시험대. 자기 영상에서 만든 검출 자료가 필요합니다 |
| `research/` | 효과가 없었거나 분리한 실험 코드 |
| `docs/RESEARCH_SUMMARY.md` | 시도와 결론 요약 |

## 측정 결과 (합성 조각)

도형으로 그린 사람 조각의 값입니다. **실제 영상의 정확도가 아닙니다.** A는 제품 판단, B는 `lab` 후보입니다. 한 조건에 시드 200개씩, 값을 고르지 않은 시드로 쟀습니다.

같은 유니폼의 다른 사람이 영상 안에 있을 때:

| 조건 | 맞는 사람 수락 % (A→B) | 다른 사람 수락 % (A→B) | 보류·묻기 % (A→B) |
|---|---:|---:|---:|
| 보통 | 27.0 → 27.5 | 18.5 → 15.7 | 48.5 → 59.5 |
| 조명 급감 | 24.5 → 10.5 | 16.8 → 5.8 | 52.0 → 70.6 |
| 조명 급증 | 25.0 → 13.5 | 16.2 → 6.8 | 52.4 → 71.0 |
| 심한 번짐 | 30.5 → 7.0 | 21.0 → 6.5 | 49.6 → 77.3 |
| 상반신 가림 | 4.0 → 0.5 | 2.7 → 0.3 | 64.9 → 83.0 |
| 하반신 가림 | 4.0 → 1.5 | 3.0 → 1.3 | 73.5 → 72.0 |

읽는 법:

- B는 나쁜 조건에서 다른 사람을 받아들이는 비율을 크게 줄입니다. 대신 맞는 사람도 덜 받아들이고 더 자주 묻습니다. 공짜 개선이 아닙니다.
- 같은 유니폼이 없는 경우에는 B가 맞는 사람을 더 받아들이지만 다른 사람도 더 받아들입니다(보통 조건 18.5% → 25.5%). 그래서 **아직 제품에 넣을 후보가 아닙니다.**
- 같은 옷은 색만으로 가를 수 없습니다. 이 때문에 "애매하면 묻기"가 핵심입니다.

## 이용 조건 요약

| 이용 | 가능 여부 |
|---|---|
| 개인 학습, 취미, 교육, 비영리 연구, 비상업적 평가 | 가능. 출처 표시 필수 |
| 유료 제품, 수익 서비스, 영리 조직의 내부 사용, 고객 용역 | 사전 서면 승인 필수 |
| 이 코드를 참고한 상업 제품 개발, 모델 학습 자료로 사용 | 사전 서면 승인 필수 |
| 지문, 저작권 표시, `NOTICE` 삭제 | 금지 |
| 몰래 추적, 감시, 얼굴이나 신체로 신원 식별, 사람 데이터베이스 대조 | 승인과 무관하게 금지 |

소스 공개 라이선스이며, OSI가 정의한 오픈소스 라이선스는 아닙니다. 신청 방법은 [상업적 이용 신청](docs/COMMERCIAL_LICENSING.md) 에 있고, [기술 보호](docs/PROTECTION.md) 와 [자료 권리 기준](docs/DATA_RIGHTS.md) 도 함께 봐 주세요.

## 구성과 한계

`runtime/` 은 비공개 제품 정본에서 뽑은 사본이라 직접 고치지 않습니다. 시험 영상, 라벨, 임베딩, 가중치는 공개하지 않습니다. 추적 전체는 [HILiT Tracking Tec](https://github.com/ccw00325-spec/HILiT_Tracking_Tec), 카메라는 [HILiT Camera Mov](https://github.com/ccw00325-spec/HILiT_camera_mov) 에 있습니다.

## English

HILiT ReID helps confirm that a re-appearing person is the one the user selected, within a single video. Appearance scores are supporting evidence, not identity probabilities, and the system asks the user when unsure. It is not a person database or identification system. **Free for noncommercial use only. Commercial use requires prior written approval from the author: ccw00325@gmail.com.** You must credit **HILiT ReID**, **조찬우 (Chanwoo Cho)**, and **https://github.com/ccw00325-spec/HILiT_ReID** whenever you use or publish it. See [`LICENSE`](LICENSE). This is a source-available license, not an OSI open source license. Results are from synthetic crops, not real footage.
