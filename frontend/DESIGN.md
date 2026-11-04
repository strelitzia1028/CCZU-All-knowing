# DESIGN.md

## 项目与用户画像
- 面向常州大学西太湖校区在校大学生
- 学生向、清爽明亮、卡片化设计
- 移动端优先响应式

## Design Tokens

### 色彩
- 主色：蓝色系（#2563EB / blue-600），传递信任与校园感
- 背景色：浅灰（#F9FAFB / gray-50）
- 卡片色：白色（#FFFFFF）带浅灰边框
- 强调色：紫色（管理员标识）、绿色（通过状态）、红色（驳回/删除）、琥珀色（警告/示例数据）

### 字体
- 字体族：PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif
- 标题：font-semibold / text-lg~xl
- 正文：text-sm / leading-relaxed
- 辅助信息：text-xs / text-gray-400~500

### 圆角
- 卡片：rounded-xl（12px）
- 按钮：rounded-lg（8px）
- 标签/徽章：rounded-full / rounded

### 间距
- 页面内边距：px-4
- 卡片内边距：p-4~p-6
- 列表间距：space-y-3

## 布局
- 顶部固定导航栏（sticky），高度 h-14
- 内容区最大宽度 max-w-3xl~5xl 居中
- 对话页：消息流 + 底部输入框固定
- 管理后台：列表 + 详情双栏布局

## 交互
- 对话流式输出，打字机效果
- 来源卡片可展开/收起
- 排序切换即时生效
- 角色切换通过顶部按钮

## 设计禁忌
- 不使用深色主题
- 不使用过度装饰的渐变
- 不使用复杂动画
