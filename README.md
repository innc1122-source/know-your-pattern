# Know Your Pattern

A single-file, offline-first web app for noticing what repeats in how you
react — and seeing whether your response to it changes over time. It is not a
journal and not therapy: it looks for things that recur, always shows you the
evidence, and never diagnoses you or tells you who you are.

The interface is bilingual (简体中文 / English) and styled for a phone.

## How it works

You capture a **moment** whenever something gets to you. Each moment records:

- **What happened** — one sentence (typed or dictated by voice).
- **Your first reaction** — an emoji-tagged gut response.
- **The signal** — what actually got you, from a small fixed vocabulary
  (autonomy, being heard, fairness, standards, being seen, certainty,
  capacity, friction, belonging, competence).
- **Intensity, context, and what you did next.**

The vocabulary is closed by design: cross-time comparison only works if the
same experience gets the same label every time.

Over time the app surfaces, in order of how much evidence it has:

- **Connection** — this signal has been here before.
- **Glimpse** — a signal starting to show, not yet a conclusion.
- **Prediction** — the app puts itself on the line, then checks if it was right.
- **Pattern** — earned from volume + spread + your confirmation, with a
  confidence that can also go *down*.
- **Change** — the same trigger, compared across time, to show whether your
  response to it has moved.
- **Weekly snapshot** — a quiet day-7 summary of the week you noticed.

## Usage

Open `index.html` in any modern browser — there is no build step, no server,
and no dependencies to install. To publish it, enable GitHub Pages on this
repository; `index.html` at the root is served as the entry point.

## Privacy

Everything stays on your device via `localStorage`. Nothing is sent anywhere.
You can export all of your data as JSON and import it again as a backup. If the
browser cannot persist data, the app warns you and keeps working in memory.

## Tech

Vanilla HTML, CSS, and JavaScript in a single file. The reasoning engine
(`KYP`) is written as pure, DOM-free functions so it could be ported later.
The only external resource is Google Fonts.

---

# 认识你的模式

一个单文件、离线优先的网页应用，用来看见你的反应里不断重复的东西——并观察你对
它的回应是否随时间发生了改变。它不是日记，也不是心理治疗：它只寻找反复出现的
东西，永远把依据摆给你看，不诊断你，也不会告诉你「你是谁」。

界面是双语的（简体中文 / English），并按手机屏幕设计。

## 它怎么用

每当有什么触动到你，就记录一个**瞬间**。每条记录包含：发生了什么（一句话，可
打字或语音输入）、你的第一反应、最戳到你的**信号**（来自一个很小的固定词表）、
强度、场景，以及你接下来做了什么。词表刻意是封闭的：只有同一种体验每次都用同
一个标签，跨时间的比较才成立。

随着记录增多，应用会按证据多少依次呈现：**连接**（这个信号出现过）、**苗头**、
**预测**（应用先押一个判断，之后再验证对不对）、**模式**（由数量、跨度和你的确
认共同赢得，可信度也会下降）、**变化**（同一个触发跨时间对比，看你的回应有没有
动），以及每周的**快照**。

## 使用

在任意现代浏览器中打开 `index.html` 即可——无需构建、无需服务器、无需安装依
赖。想要发布，可在本仓库启用 GitHub Pages，根目录的 `index.html` 会作为入口
被访问。

## 隐私

所有数据都通过 `localStorage` 留在你的设备上，不会发送到任何地方。你可以把全部
数据导出为 JSON，并随时导入作为备份。
