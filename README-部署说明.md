# WordPuzzle PWA · 部署与安装说明

这是 v6 的 PWA（可安装、可离线）版本。文件清单：

- `index.html` — 应用本体（= wordpuzzle-mvp-v6，含全部逻辑与词库）
- `manifest.webmanifest` — 应用清单（名称、图标、显示方式）
- `sw.js` — service worker（离线缓存）
- `icon-192.png` / `icon-512.png` / `icon-maskable-512.png` / `apple-touch-icon.png` — 图标

## 为什么要联网部署（不能直接双击打开）

service worker 和 manifest 只在 `https://`（或 `localhost`）下生效，直接用 `file://` 双击打开 index.html **不会**有安装和离线能力（但游戏本身能玩）。所以要放到 GitHub Pages 这类静态托管上。

## 用 GitHub Pages 部署（5 步）

1. 新建一个仓库（或用你现有的），把本文件夹里**所有文件**放到仓库根目录（或某个子目录）。
2. 提交并推送。
3. 仓库 Settings → Pages → Source 选 `Deploy from a branch`，分支选 `main`、目录选 `/ (root)`（若放在子目录则相应选择）。
4. 等 1–2 分钟，得到网址，如 `https://你的用户名.github.io/仓库名/`。
5. 用手机浏览器打开这个网址即可。

## 安装到主屏

- **安卓 / Chrome**：打开网址后，通常会自动提示"安装应用"；或点右上角设置齿轮 → "安装到主屏 → 立即安装"；或浏览器菜单 → "添加到主屏幕"。
- **iPhone / Safari**：打开网址 → 点底部「分享」按钮 → 「添加到主屏幕」。（iOS 不支持自动安装弹窗，属正常。）

装好后从主屏图标打开，全屏运行、可离线、和 App 体验一致。

## 升级 app

改完 `index.html` 后，把 `sw.js` 里的 `const CACHE = 'wordpuzzle-v6'` 版本号改一下（如 `-v7`），推送即可让所有设备下次打开时拉取新版。**用户的学习数据存在 localStorage，升级不受影响、不会丢。**

## 分享给别人

直接把网址发给对方即可打开使用。注意：进度存在各自设备的浏览器本地（localStorage），是"一人一设备一进度"；换设备/清缓存会重来。若以后要做"换设备进度同步"，需引入轻量云存储（见规划文档第 11 章 C 阶段）。
