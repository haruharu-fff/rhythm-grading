# Onset detector sweep report

This report is generated from the supplied dataset manifest. Synthetic fixtures are a
software regression baseline, not evidence that the detector meets the real-recording
gates.

| Rank | Config                                                   |    F1 | Precision | Recall | Adjusted MAE |     P95 |
| ---: | -------------------------------------------------------- | ----: | --------: | -----: | -----------: | ------: |
|    1 | `{"refinementRiseFraction":0.08,"thresholdOffsetDb":9}`  | 1.000 |     1.000 |  1.000 |      0.03 ms | 0.13 ms |
|    2 | `{"refinementRiseFraction":0.08,"thresholdOffsetDb":12}` | 1.000 |     1.000 |  1.000 |      0.03 ms | 0.13 ms |
|    3 | `{"refinementRiseFraction":0.08,"thresholdOffsetDb":15}` | 1.000 |     1.000 |  1.000 |      0.03 ms | 0.13 ms |
|    4 | `{"refinementRiseFraction":0.1,"thresholdOffsetDb":9}`   | 1.000 |     1.000 |  1.000 |      0.03 ms | 0.13 ms |
|    5 | `{"refinementRiseFraction":0.1,"thresholdOffsetDb":12}`  | 1.000 |     1.000 |  1.000 |      0.03 ms | 0.13 ms |
|    6 | `{"refinementRiseFraction":0.1,"thresholdOffsetDb":15}`  | 1.000 |     1.000 |  1.000 |      0.03 ms | 0.13 ms |

## Interpretation

Review the stratified CSV rows and diagnostic waveform plots before selecting a
preset.
Do not promote these parameters to a product default until practice-pad and snare
recordings cover strength, tempo, pattern, microphone distance, and orientation axes.
