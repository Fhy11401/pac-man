# 吃豆人 Pac-Man — GBU 小组项目

一个用 **待填：语言/框架** 实现的经典吃豆人小游戏，作为《构建带有 Vibe 编码的智能 AI 产品》课程的小组项目。

## 项目简介

玩家控制吃豆人吃掉迷宫里的所有豆子，同时躲避四只幽灵。吃到能量豆后可以反过来吃掉幽灵。
目标是在三条命用完之前通关。

## 玩法

- **移动**：方向键 或 `WASD`
- **吃豆**：走过豆子自动吃掉，全部吃完进入下一关
- **幽灵**：碰到扣一条命，出生点复活
- **能量豆**：吃掉后幽灵变蓝，短时间内可以反吃
- **暂停**：`Space` 或 `P`

## 技术栈

| 项目 | 内容 |
| --- | --- |
| 语言 | 待填（例如 Python / JavaScript） |
| 框架或库 | 待填（例如 Pygame / Canvas / Phaser） |
| 运行环境 | 待填（例如 Python 3.12 / Node 20） |

## 本地运行

```bash
git clone https://github.com/luze-111/pac-man.git
cd pac-man

# 安装依赖（没有依赖就删掉这行）
待填：pip install -r requirements.txt  或  npm install

# 启动
待填：python main.py  或  npm run dev
```

> 如果没有依赖，直接双击 `index.html` 或用浏览器打开也可以。

## 目录结构

```text
pac-man/
├── src/            # 游戏逻辑（地图、角色、计分）
├── assets/         # 图片、音效
├── README.md
└── 待填：入口文件
```

## 小组成员

| 姓名 | GitHub | 负责 |
| --- | --- | --- |
| 卢泽 | [@luze-111](https://github.com/luze-111) | 项目搭建、游戏主循环 |
| 待填 | @待填 | 地图与渲染 |
| 待填 | @待填 | 幽灵 AI |
| 待填 | @待填 | 音效与关卡 |

## 开发进度

- [x] 创建仓库、写 README
- [ ] 地图与角色渲染
- [ ] 吃豆、计分、生命值
- [ ] 幽灵移动与追逐
- [ ] 能量豆与反吃
- [ ] 音效、开始/结束界面
- [ ] 打包与演示

## 协作约定

1. **不直接推 `main`**：每人开自己的分支，例如 `git switch -c feature/ghost-ai`。
2. **用 Pull Request 合并**：PR 至少一名组员看过再合并。
3. **提交信息写清楚做了什么**：`Add ghost chase logic`，不要只写 `update`。
4. **不提交密钥和本地文件**：`.env`、`node_modules/`、`__pycache__/` 写进 `.gitignore`。
5. **开工前先 `git pull`**，减少冲突。

## 参考

- 原版 *Pac-Man*（1980，Namco）
- 课程材料与课堂示例
