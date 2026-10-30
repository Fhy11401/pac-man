# 配乐与替换音频

默认配乐由 `src/music-score.js` 为本项目原创生成，不包含《黑暗欺骗》的音频采样或旋律。四条同步循环音轨分别为 exploration（探索）、tension（接近）、chase（追逐）、escape（撤离）。生成工作在 Worker 中完成，不阻塞走路与鼠标输入。

距离与视线决定紧张程度；追逐状态保留 3.5 秒并平滑退场，避免拐角处反复切歌。撤离会加入更密集的高音弦乐和节奏。敌人很近时，音乐适当降低，为脚步和心跳留出空间。被抓时音乐停止，让惊吓音效单独出现；重生重新进入探索配乐。暂停、静音、重开均管理音源生命周期。

## 使用你提供的本地音频

将可用于本项目的音频放入此目录下的 `local/`，然后修改 `tracks.json`。文件路径相对于 `tracks.json`；未填写、读取失败或解码失败的层仍使用默认原创音轨。MP3、WAV、OGG 的实际支持取决于浏览器。`local/` 已加入 Git 忽略，避免在提交代码时连带上传音频。

示例（文件需自行提供，仓库没有这些音频）：

```json
{
  "exploration": "./local/exploration.mp3",
  "chase": "./local/chase.mp3",
  "escape": "./local/escape.mp3"
}
```

各层独立循环和渐变，最好使用剪好循环点、音量相近的版本。若使用完整混音而非分轨，建议把未替换层的影响纳入试听；开发阶段可在 `MusicState.update` 调整各层比例。配置仅接受当前站点的 URL，不加载第三方音乐服务。

## 本轮查阅的原声来源

- [Glowstick 官方发布：Monkey Business](https://www.youtube.com/watch?v=OkItmL-UJOw)，曲目说明署名 Chris Pinkston。
- [Dark Deception: Chapters 1–3 原声专辑](https://darkdeception.hearnow.com/dark-deception%3A-chapters-1-3)，含 Monkey Business、Feeding Frenzy、Going Up 等曲目。

上述链接仅用于查阅与试听；本游戏没有下载或打包其中的原声录音。现在的默认配乐是原创替代方案，不应标注为《黑暗欺骗》官方音乐。
