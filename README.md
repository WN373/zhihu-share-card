# 知乎回答分享卡片生成器 (Zhihu Share Card)

一键将知乎回答、专栏文章或划词选中的金句渲染为精致的分享图片（Tampermonkey / Violentmonkey 油猴脚本）。

## 一键安装

先在浏览器安装 [Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/)，然后点击下方链接即可安装（并支持自动更新）：

👉 **[点击一键安装 zhihu-share-card.user.js](https://raw.githubusercontent.com/WN373/zhihu-share-card/main/zhihu-share-card.user.js)**

## 主要功能

- **回答 / 专栏整篇分享**：在知乎回答或专栏底部操作栏自动注入 **「生成分享图」** 按钮。
- **划词金句卡片**：在正文中选中任意文字，点击浮现的 **「生成金句卡片」** 即可只渲染选中段落。
- **多主题与排版自定义**：支持浅色 / 暖纸 / 深色 / 知乎蓝主题，可调节宽度、导出倍率，自由开关标题、作者信息、互动数据、外框与原文二维码。
- **便捷导出**：支持一键复制图片到剪贴板，或直接下载高清 PNG。
- **跨域图片兼容**：通过 `GM_xmlhttpRequest` 自动内联知乎头像与配图，避免导出空白。

## 使用说明

1. 安装脚本后刷新任意知乎回答或专栏页面。
2. 点击底部操作栏的 **「生成分享图」**，或在正文中划词后点击 **「生成金句卡片」**。
3. 首次渲染包含头像或配图的回答时，如果油猴弹出跨域访问确认（`zhimg.com` / `zhihu.com`），选择 **「始终允许」** 即可。

## 本地预览

仓库附带了独立演示页 [`demo.html`](./demo.html)，用浏览器直接打开即可预览卡片排版与主题效果。

## License

[MIT](./LICENSE)
