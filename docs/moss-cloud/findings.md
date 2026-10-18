# 发现与决策

- iPadOS 26.3 本机 Moss 卡退，旧重模型测试已停用。首选参数见 ../preferred-audition.json，增益固定 0，用户自调响度。
- 已安装的 Userscripts 桥接允许 init.job；新增 mode 可复用认证，不要求再次安装脚本。
- 学校媒体读取已有原站/GM/认证云端 Range 回退，不读取学校密码。新功能仅提取需要的小时间窗，不调用整课 __CE_AUDIO_PREPARE__。
- 云端接受有界 AAC MP4 字节，不接受任意网址，避免后台取学校流的网络/来源问题。
- 采用 native Audio 的 preservesPitch，双缓冲片段交叉切换；不使用会在倍速改变音调的 AudioBufferSource.playbackRate。
- 准备期间继续原声。快进/换轨时废弃旧请求结果，缓存有限，不同时处理三路。
- 用户已明确选择腾讯云。现有密钥仅验证过 ASR，SCF 查询无权限；需用户在已打开的控制台登录后核对，不反复重试同一无权限 API。
- 腾讯云 WebServer 镜像固定监听 0.0.0.0:9000，HTTP Server 需 30 秒内启动；已适配，GPU 模型保持首次有效请求才初始化。
- 官方文档要求镜像解压前小于 1GB，超限需申请；GPU CUDA/cuDNN 镜像可能超限。新增 CI 测量 OCI 压缩层大小，实际 GPU 配额与镜像额度未获确认。
- 官方 GPU 规格表中 GN7.LARGE20/GN7.2XLARGE40 已停售，GN7.2XLARGE32 限 Stable Diffusion 场景。不能按旧教程承诺廉价四分之一计算卡可用。渲染 GN7vw 的 CUDA 可用性和余量需实测。
- 官方资源单价 0.00011108 元/GB秒，16 GiB 配置累计执行小时约 6.40 元、32 GiB 约 12.80 元；流量/调用等另计。按需配置无预置并发，实际成本取决于处理速度和平台计时，不等同于每听课小时费用。
- 主要来源：https://cloud.tencent.com/document/product/583/68734 、https://cloud.tencent.com/document/product/583/12281 、https://cloud.tencent.com/document/product/583/56051 。核对时间 2026-10-18。
