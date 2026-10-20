# 同日簿（OUR DAYBOOK）云数据库设计（第二阶段）

## 集合

`users`：`_openid`、昵称、头像 fileID、手动城市、纪念日、城市可见性、主题、创建/更新时间。

`couples`：成员 openid 数组（最多 2 人）、`spaceType`（`personal` 或 `pair`）、`personalOwnerId`、`pairedAt`、邀请码摘要、到期时间、尝试次数、状态、创建时间。个人空间可升级为双人空间。邀请码需唯一、有时效且限流，数据库不保存可长期滥用的明文凭证。

`dailyTasks`：`coupleId + dateKey` 唯一索引、题目快照、创建时间。云函数事务保证同一空间同一天只有一道题。

`entries`：`coupleId + dateKey + ownerOpenid` 唯一索引、轻量展示图 `imagePath`、文字、城市快照、`recordMode`、`visibility`、提交/更新时间、删除状态。每条记录只保存一张压缩后的私有展示图；原始照片不上传，由用户自己的系统相册保管。个人记录使用 `recordMode: personal` 与 `visibility: private`；空间升级后不得自动向新成员公开历史个人记录。

`prompts`：所有者（系统或 coupleId）、文字、分类、启用状态、自定义标记、时间。

`meetings`：coupleId、日期、城市、备注、创建者。

`settings`：openid、提醒、应用主题、卡片主题。

`pendingUploads`：客户端上传成功后的临时登记，包含 openid、私有 fileID、用途和状态。记录或头像保存成功后标记为 `used`；超过 24 小时仍为 `pending` 的文件由定时清理函数删除，避免提交失败留下孤立文件。

## 权限与云函数

客户端默认无权直接读取 `entries`。`getTodayStatus` 从微信上下文取得 openid，验证成员关系，只返回调用者自己的 entry 和获准共享的对方状态；个人记录只返回给作者本人，双人记录只有双方存在有效记录才返回双方内容。所有写操作忽略前端传入的 userId。照片使用私有云存储 fileID，需要查看时由云函数在授权后换取短期 URL。

建议云函数：`login`、`coupleCreate`、`couplePreview`、`coupleJoin`、`coupleUnbind`、`taskToday`、`entrySubmit`、`entryUpdate`、`entryDelete`、`todayStatus`、`memoryList`、`dataExport`、`accountDelete`。绑定、题目生成和提交使用事务/唯一索引避免并发重复。

解绑默认保留双方共同历史；销户只删除用户个人资料和其照片，并按产品政策处理共同记录的匿名化或双方确认删除。

## 建议索引

上线环境应在云开发控制台建立并核对以下索引；字段顺序与实际查询条件保持一致：

- `entries`：`coupleId + dateKey + deleted`，用于当天状态、年度日历和回忆查询。
- `entries`：`ownerOpenid + dateKey`，用于用户数据导出和销户清理。
- `dailyTasks`：`coupleId + dateKey` 唯一索引，防止同一空间同一天生成重复题目。
- `meetings`：`coupleId + date`，用于按日期读取相遇计划。
- `pendingUploads`：`status + createdAt`，用于定时清理孤立文件。
- `reminders`：`status + remindAt`，用于定时扫描待发送提醒。
