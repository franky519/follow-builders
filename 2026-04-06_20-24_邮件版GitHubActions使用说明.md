# follow-builders 邮件版 GitHub Actions 使用说明

日期：2026-04-06 20:24（北京时间）

## 这份仓库副本已经替你做了什么

这份目录已经补好了邮件版自动日报需要的核心缺口：

1. 新增 `scripts/remix-digest.js`
2. 新增 `.github/workflows/send-email-digest.yml`
3. 删除原来的 `generate-feed.yml`

这样做的原因很简单：

- 你现在并不想自己维护 X / 播客 / blog 采集
- 你只想消费官方中央 feed，然后每天发邮件给自己
- 原仓库默认的 GitHub workflow 是“生成 feed”，不是“生成并发送你的个人日报”

## 你还需要自己补的只有 4 个值

### GitHub Secrets

1. `OPENAI_API_KEY`
2. `RESEND_API_KEY`

### GitHub Variables

1. `OPENAI_BASE_URL`
2. `OPENAI_MODEL`
3. `DIGEST_TO_EMAIL`

其中：

- `DIGEST_TO_EMAIL` 请填：`fnckc@follow.re`
- `OPENAI_BASE_URL` 可以是 OpenAI 官方，也可以是你自己的 OpenAI-compatible 网关
- `OPENAI_MODEL` 建议用至少 128k 上下文的模型

## `RESEND_API_KEY` 从哪里来

你实际会看到的流程是：

1. 去 [Resend](https://resend.com) 注册账号
2. 进入 Dashboard
3. 找到 `API Keys`
4. 新建一个 API key
5. 把这个值填进 GitHub Secret `RESEND_API_KEY`

如果你只是先验证流程，`deliver.js` 当前默认发件人是：

`AI Builders Digest <digest@resend.dev>`

也就是说：

- 你一开始甚至不用先绑自己的发件域名
- 先跑通“能收到日报”更重要
- 等你确认长期使用，再上自定义域名

## 一步一步：把 `RESEND_API_KEY` 填到 GitHub Secret

先说你最后会看到什么结果：

- Resend 那边会生成一个以 `re_` 开头的 key
- GitHub 仓库里会多出一个名叫 `RESEND_API_KEY` 的 Actions secret
- 之后 workflow 运行时，就能安全读取这个值发邮件

### 第 1 步：在 Resend 创建 API key

1. 打开 [Resend Dashboard 的 API Keys 页面](https://resend.com/api-keys)
2. 点击 `Create API Key`
3. `Name` 可以填：`follow-builders-github-actions`
4. `Permission` 建议选 `Sending access`
5. 如果页面要求你选 domain，而你只是先跑通流程，就按当前页面可选项继续
6. 点击创建
7. 立刻复制生成的 key

这里有个很关键的点：

- 这个 key 出来后通常只会给你看一次
- 如果你当场没复制，后面一般不能再原样看见，只能删掉重建

### 第 2 步：打开你的 GitHub 仓库

注意，是你自己的 fork 仓库，不是本地目录。

进入后按这个路径点：

1. 打开仓库主页
2. 点击 `Settings`
3. 左侧找到 `Secrets and variables`
4. 点击 `Actions`
5. 确认当前在 `Secrets` 标签页
6. 点击 `New repository secret`

### 第 3 步：新增 `RESEND_API_KEY`

在 GitHub 表单里这样填：

- `Name`：`RESEND_API_KEY`
- `Secret`：粘贴你刚才从 Resend 复制的那串 `re_...`

然后点击：

- `Add secret`

到这里，这个 secret 就配好了。

### 第 4 步：顺手把另外几个值也配掉

因为你这个 workflow 不只要 Resend，还要 LLM，所以建议你一次配完。

#### GitHub Secrets

1. `OPENAI_API_KEY`
2. `RESEND_API_KEY`

#### GitHub Variables

1. `OPENAI_BASE_URL`
2. `OPENAI_MODEL`
3. `DIGEST_TO_EMAIL`

其中：

- `DIGEST_TO_EMAIL` 填 `fnckc@follow.re`
- `OPENAI_BASE_URL` 填你的 OpenAI-compatible 接口地址
- `OPENAI_MODEL` 填你要跑的模型名

### 第 5 步：手动跑一次验证

配完后去 GitHub：

1. 打开 `Actions`
2. 点进 `Send Email Digest`
3. 点击 `Run workflow`

如果配置对了，你实际会看到：

- workflow 跑成功
- 邮箱收到日报

如果这里失败，最常见的区别是：

- `RESEND_API_KEY` 填错：会卡在发邮件步骤
- `OPENAI_API_KEY` / `OPENAI_MODEL` / `OPENAI_BASE_URL` 有问题：会卡在 `Remix digest with LLM`

## 为什么官方仓库现在还不能直接满足你的 GitHub Actions 需求

先说你实际会看到的差异。

### 官方现在已经有的

官方已经有：

- `scripts/prepare-digest.js`
- `scripts/deliver.js`
- skill 里的 prompts

这些东西足够支持“代理在线运行时”的流程：

1. `prepare-digest.js` 拉原始材料
2. 代理自己读 JSON
3. 代理根据 prompts 重写成 digest
4. `deliver.js` 发出去

### 官方现在还没有的

官方没有一个能在 GitHub Actions 里独立运行的脚本，把第 2 步和第 3 步自动化。

也就是说，缺的不是“prompt”，而是“把 prompt 真正接到 LLM API 上跑的无人值守脚本”。

这就是这里新增 `remix-digest.js` 的原因。

## 这里新增的 `remix-digest.js` 具体解决了什么

它做的是：

1. 接收 `prepare-digest.js` 输出的 JSON
2. 读取里面已经准备好的 prompts
3. 调用你的 OpenAI-compatible 接口
4. 输出适合邮件阅读的最终 Markdown 正文

所以它不是另起炉灶重做一套 follow-builders。

更准确地说，它是在补官方 skill 里“代理自己完成的那一步”，让 GitHub Actions 也能自动做。

## 邮件工作流现在怎么跑

`send-email-digest.yml` 的链路是：

1. 每天北京时间 08:00 触发
2. 临时写入 `~/.follow-builders/config.json`
3. `prepare-digest.js` 拉官方中央 feed
4. `remix-digest.js` 调你的 LLM 生成日报正文
5. `deliver.js` 通过 Resend 发邮件

## 建议你后面的最短操作顺序

1. 先在 GitHub 上 fork 官方 `follow-builders`
2. 把这个目录里的改动拷进去，或者把这个目录直接当成你自己的起点仓库
3. 在 GitHub Actions 里配置上面那 5 个 Secrets / Variables
4. 手动运行一次 `Send Email Digest`
5. 确认邮箱收到后，再等每天定时触发

## 这份目录里最关键的文件

- `scripts/remix-digest.js`
- `.github/workflows/send-email-digest.yml`
- 本说明文档
