# PATTERNA

**Notice what repeats. See what changes.**
看见重复，也看见改变。

一个记录工具。事情发生、让你在意的时候打开，一分钟内记完，然后它帮你看见什么在重复、以及你对它的反应有没有在变。

完整的产品与开发说明在 **[PRODUCT.md](PRODUCT.md)**。这份 README 只讲怎么跑起来。

---

## 直接使用

`deploy/index.html` 是成品，单文件，双击就开。不需要服务器、不需要联网、不需要安装。

数据存在浏览器本地（localStorage），从不上传。

---

## 文件

```
deploy/
  index.html         成品，构建产物，直接可用，也是上传到静态托管的那个文件
  README.txt         部署步骤

PRODUCT.md           产品与开发文档
patterna-icon.png    logo 原图

src/
  engine.js          模式引擎，纯函数，无 DOM 无网络依赖
  app.js             词表 + 双语文案 + 存储层
  ui.js              界面与流程
  shell.html         外壳、样式、内嵌图标与 PWA manifest
  build.js           构建脚本
  engine.test.js     引擎测试，54 项
  app.test.js        应用测试，110 项（jsdom 驱动真实 DOM）
  package.json
```

**为什么源码分四块而成品是一个文件：** 分开写才改得动，合成一个才好分发。`shell.html` 里有三个占位符，构建时把三段 JS 塞进去。

---

## 开发

```bash
cd src
npm install                      # 只有一个依赖：jsdom，供测试使用
node build.js ../deploy/index.html   # 构建
node engine.test.js              # 54 项
node app.test.js                 # 110 项
```

改完源码必须重新构建，否则 `deploy/index.html` 还是旧的。

（`app.test.js` 默认读取同目录的 `patterna.html`。要测构建产物，先 `node build.js` 生成到 src 下再跑，或改掉文件里那一行路径。）

**两个测试的分工不同，都要跑。** 引擎测试验的是判断规则的边界（几次算模式、跨几天才比较、可信度怎么升降）；应用测试用 jsdom 真跑一遍界面，验的是流程和渲染。

有一类 bug 只有后者能抓到——比如 `<div id="flow">` 会自动创建同名全局变量、把状态变量遮住，语法检查完全正常，一点就崩。

---

## 引擎可以单独用

`engine.js` 不依赖任何环境，输入一个记录数组，输出判断结果：

```js
const KYP = require('./engine.js');

KYP.glimpse(moments)          // 正在浮现的信号
KYP.pattern(moments)          // 模式 + 可信度 + 竞争解释
KYP.change(moments, 'autonomy')  // 那时 → 现在
KYP.offListReport(moments)    // 词表没接住的东西
```

所有阈值集中在 `KYP.TH`，是**唯一需要用真实数据调的东西**。每条阈值为什么是这个数，见 PRODUCT.md 第 5.3 节。

要迁到 Python（FastAPI + SQLite），直接翻译这个文件，54 个测试一起翻，行为不会变。

---

## 部署

任何静态托管都行。GitHub Pages：

1. 新建 public 仓库
2. 上传 `deploy/index.html`（已经是正确的文件名，不用改）
3. Settings → Pages → Source 选 `main` 分支 → Save

**页面是公开的，内容是私有的**——数据在访问者自己的浏览器里，从不上传。

手机打开后可「添加到主屏幕」，全屏运行、带图标、离线可用。

---

## 数据会丢

localStorage 跟着「网址 + 浏览器」走。换域名、换浏览器、换设备都不通用。

**iOS Safari 有七天未访问即清除的机制**，而这是个「有事才用」的产品，两周不打开很正常。

**定期从「我 → 导出全部」存一份 JSON，不是可选项。**

---

## 状态

已实现并通过测试的东西见 PRODUCT.md 第 1–10 节，待办见第 11 节。

最后一节 **「还没被验证的事」** 是五个没有答案的问题，其中第一个是：难受的当下，人会不会真的打开它。

**如果那个答案是否定的，其余一切都不成立。**
