# 永夜旅馆：用户提供的双曲配乐

当前默认配置使用用户于 2026-10-30 提供的音频：

| 距离 | 曲目 / 作者 | 游戏内文件 | 音频时长 |
| --- | --- | --- | --- |
| 较远 | Monkey Business — Chris Pinkston | local/monkey-business.mp3 | 约 52.51 秒 |
| 较近 | Feeding Frenzy — Chris Pinkston | local/feeding-frenzy.mp3 | 约 59.93 秒 |

来源分别为用户提供的 `Monkey_Business_-_Chris_Pinkston.zip` 与 `Feeding_Frenzy_-_Chris_Pinkston.zip` 内的 FLAC。以 FFmpeg 转换为 192 kbps、48 kHz、双声道 MP3，未下载其他原声，未改变旋律或剪短用户音频。曲目与录音不属于本项目原创资产。

`tracks.json` 的 `distance-pair` 模式只播放这两首完整混音，不叠加四条合成分轨。敌人进入 4 格（约 9.6 m）开始渐入第二首；离开至 5.2 格（约 12.48 m）以上保持 1.5 秒后渐回第一首，中间距离保持当前选择，避免反复切换。交叉渐变约一秒，播放位置连续，各自按文件时长循环。距离判定不因隔墙突然换曲；屏幕红光仍遵循墙体遮挡。

极近距离略降低音乐，为脚步和心跳让出空间。暂停/静音/死亡停止音源，恢复继续之前位置；重生/重开重置。设置中的背景音乐音量继续有效。解码一次后复用，不在移动循环里请求音频；如果任一文件不可读取或解码，整组退回原有原创合成配乐，避免只加载一首或叠加两套配乐。

这两份用户提供的音频随当前个人分支一并保存。后续分发应保留作者署名，并按相应音乐授权处理。

历史原声来源链接：[Monkey Business 官方曲目](https://www.youtube.com/watch?v=OkItmL-UJOw)、[Chapters 1–3 原声专辑](https://darkdeception.hearnow.com/dark-deception%3A-chapters-1-3)。本次实际接入来源是用户的本地 ZIP。
