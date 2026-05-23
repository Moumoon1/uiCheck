from PIL import Image, ImageDraw
import os

DEV_PATH = "/Users/jinhui/Desktop/claudeprog/designer-platform/inputs/uicheck/1778225831029-jd6s2o-dev_screenshot.png"
DES_PATH = "/Users/jinhui/Desktop/claudeprog/designer-platform/inputs/uicheck/1778225831040-yc9g3w-design_mockup.png"
OUT_DIR = "/Users/jinhui/Desktop/claudeprog/.claude/skills/uicheck_pro/outputs"

dev_img = Image.open(DEV_PATH)
des_img = Image.open(DES_PATH)

RED = (255, 0, 0)
LINE_W = 3

def crop_and_box(src, box, crop_region, save_path):
    crop_region = [max(0, v) for v in crop_region]
    crop_region[2] = min(src.size[0], crop_region[2])
    crop_region[3] = min(src.size[1], crop_region[3])
    cropped = src.crop(crop_region)
    draw = ImageDraw.Draw(cropped)
    adj = [box[0] - crop_region[0], box[1] - crop_region[1],
           box[2] - crop_region[0], box[3] - crop_region[1]]
    draw.rectangle(adj, outline=RED, width=LINE_W)
    cropped.save(save_path)

# Issue 1: 底部CTA按钮渐变样式不一致（元素级问题 - 框按钮本身）
# Dev: 底部"立即参与"按钮，蓝紫色风格，位于页面底部约 y=1660-1736
# Design: 底部紫红渐变圆角大按钮"立即参与"，约 y=1580-1660

issue1_dev_box = (140, 1660, 688, 1736)
issue1_dev_crop = (0, 1580, 828, 1796)
crop_and_box(dev_img, issue1_dev_box, issue1_dev_crop,
             os.path.join(OUT_DIR, "issue_1_dev.png"))

issue1_des_box = (140, 1580, 688, 1660)
issue1_des_crop = (0, 1500, 828, 1782)
crop_and_box(des_img, issue1_des_box, issue1_des_crop,
             os.path.join(OUT_DIR, "issue_1_design.png"))

# Issue A1: Banner区域装饰性礼盒/奖品插画（模块级 - 框Banner中装饰插画区域）
# Dev: Banner中右侧礼盒/奖品装饰插画区域
# Design: Banner中装饰插画区域

issueA1_dev_box = (370, 100, 770, 500)
issueA1_dev_crop = (0, 0, 828, 560)
crop_and_box(dev_img, issueA1_dev_box, issueA1_dev_crop,
             os.path.join(OUT_DIR, "issue_A1_dev.png"))

issueA1_des_box = (370, 100, 770, 500)
issueA1_des_crop = (0, 0, 828, 560)
crop_and_box(des_img, issueA1_des_box, issueA1_des_crop,
             os.path.join(OUT_DIR, "issue_A1_design.png"))

# Issue A2: 各卡片区域间距节奏与留白（模块级 - 框整个卡片内容区域）
# Dev: 中段所有卡片区域（规则/奖品/步骤）
# Design: 同区域

issueA2_dev_box = (30, 540, 798, 1540)
issueA2_dev_crop = (0, 400, 828, 1600)
crop_and_box(dev_img, issueA2_dev_box, issueA2_dev_crop,
             os.path.join(OUT_DIR, "issue_A2_dev.png"))

issueA2_des_box = (30, 540, 798, 1520)
issueA2_des_crop = (0, 400, 828, 1580)
crop_and_box(des_img, issueA2_des_box, issueA2_des_crop,
             os.path.join(OUT_DIR, "issue_A2_design.png"))

print("Done!")
for f in ["issue_1_dev.png", "issue_1_design.png", "issue_A1_dev.png", "issue_A1_design.png", "issue_A2_dev.png", "issue_A2_design.png"]:
    fp = os.path.join(OUT_DIR, f)
    img = Image.open(fp)
    print(f"  {f}: {img.size}")
