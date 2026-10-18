# 私有 Moss 分段处理候选部署

状态：代码和本机链路已准备；尚未开通或连接任何付费 GPU，未上线 0.10.0。

## 已验证与边界

- 当前窗口取 AAC，不先提取或上传整节。每次最多 10 秒、1 MiB，正常约几十 KB。
- 模型是已选中的 FP32 Moss；CPU 真模型接口检查通过。使用原定 STFT、重叠规则与时间裁切。
- 返回 16 kHz PCM16 WAV，浏览器恢复打包时的固定缩放后应用全部首选 EQ/压缩参数。首选增益仍为 0。
- 原声在准备期间继续；一条云端请求在途、最多八个客户端片段、24 个服务端缓存。
- 单独的原生 Audio 片段保留倍速音调。快进/换轨会使旧回复失效；失败恢复所选路原声。
- 电脑浏览器的直通模拟服务已验证连续交接、2x 音调和音轨偏移；不是 GPU 吞吐、音质或 iPad 稳定性结论。
- Docker 基础镜像标签存在，Modal 1.6.2 可导入部署定义。Docker 守护进程未启动，未完成镜像构建和 CUDA 实测。

## 候选 A：Modal 按需 L4

配置在 `cloud/moss_modal.py`：L4 × 1、2 个 CPU 核、6 GiB 内存；最多一个实例、最低零实例、空闲回收窗口 30 秒、单次调用超时 60 秒、请求串行。无定时唤醒。使用平台代理认证，再验证独立的处理口令；健康检查只读现有网关配置，不启动 GPU。

官方 L4 单价为 0.000222 美元/GPU秒，折合约 0.7992 美元/GPU占用小时；CPU、内存等另计。此数不是一节课的费用，预取间隙/冷启动/回收窗口也影响占用。首次计划只发两次短请求做性能验证；提议首次验证预算上限 1 美元，尚待用户确认。正式持续听课的预算需要实测后另定。

GPU 要求账户有有效付款方式。账户登录、付款资料和必要验证由用户操作；不要求用户把卡号或学校密码发到聊天。

来源（2026-10-18）：
- https://modal.com/pricing
- https://modal.com/docs/guide/gpu
- https://modal.com/docs/guide/webhook-proxy-auth
- https://modal.com/docs/guide/scale

开通步骤（仅在授权后执行）：

1. 用户登录 Modal，确认计费方式与首轮预算。
2. 将随机独立的 `CE_MOSS_TOKEN` 保存为平台 Secret `classroom-moss-private`；配置所需代理令牌。秘密只保存在受忽略的本机配置/平台环境，不进代码。
3. `modal deploy cloud/moss_modal.py`；部署结果 URL 末尾加 `/enhance`。平台入口必须要求代理认证。
4. 将 endpoint/token/proxy token 写入现有 EdgeOne 环境；先保留 `CE_MOSS_ENABLED=0`。
5. 用 `scripts/check-moss-remote.py` 对一个八秒 AAC 窗口发两次请求，无自动重试，记录冷/热时延。检查平台计费，验证失败则停止部署的应用，不启动持续听课。
6. 通过后再做真实回放持续测试。发布候选运行版并设 `CE_MOSS_ENABLED=1` 后，现有加载脚本下次开页自动取得新版，不重装。

## 候选 B：已有腾讯云 GPU 或其他私有 GPU

复用同一 FastAPI 接口；仓库根目录构建 `cloud/Moss.Dockerfile`，单进程运行。需要 NVIDIA CUDA 12.8+、cuDNN 9，与固定的 ORT GPU 1.26.0 匹配。除私有媒体字节外不接受学校网址或登录凭据。

腾讯云已有凭据只有已验证的 ASR 权限，之前 SCF 查询返回无权限，不能据此声称已具有 GPU 配额。该路线需先核对账户、地区可用卡型、按量规格和控制台报价。不要预购月付机器。

## 接入环境

- `CE_MOSS_ENABLED=1`：人工验收后的总开关，否则健康检查返回未开通。
- `CE_MOSS_URL`：固定私有 `/enhance` HTTPS URL，不能由学校页面指定。
- `CE_MOSS_TOKEN`：至少 32 字符，与处理端一致。
- Modal 另需 `CE_MOSS_PROXY_KEY`、`CE_MOSS_PROXY_SECRET`；这些值不会返回到网页。
- `CE_MOSS_MODEL`：处理端模型路径，启动时校验固定 SHA-256。

关闭与撤回：先设 `CE_MOSS_ENABLED=0`，再停止平台应用。现有字幕、下载、播放器不依赖这个 GPU 服务。
