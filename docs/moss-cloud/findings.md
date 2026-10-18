# 发现与决策

- iPadOS 26.3 本机 Moss 卡退，旧重模型测试已停用。首选参数见 ../preferred-audition.json，增益固定 0，用户自调响度。
- 已安装的 Userscripts 桥接允许 init.job；新增 mode 可复用认证，不要求再次安装脚本。
- 学校媒体读取已有原站/GM/认证云端 Range 回退，不读取学校密码。新功能仅提取需要的小时间窗，不调用整课 __CE_AUDIO_PREPARE__。
- 云端接受有界 AAC MP4 字节，不接受任意网址，避免后台取学校流的网络/来源问题。
- 采用 native Audio 的 preservesPitch，双缓冲片段交叉切换；不使用会在倍速改变音调的 AudioBufferSource.playbackRate。
- 准备期间继续原声。快进/换轨时废弃旧请求结果，缓存有限，不同时处理三路。
- 现有腾讯云凭据仅 ASR 权限，未有可用 GPU 端。Modal 需有效付款方式，尚未授权开户或消费。
