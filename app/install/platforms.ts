export type PlatformId = "windows" | "macos" | "linux" | "android" | "ios";

// Later releases can add verified distribution metadata without changing guides.
export type NativeDistribution =
  | { status: "planned" | "pending" }
  | { status: "testing" | "released"; url: string; version: string; channel: string; verifiedAt: string };

export type InstallPlatform = {
  id: PlatformId;
  name: string;
  device: "desktop" | "mobile";
  subtitle: string;
  browser: string;
  steps: readonly string[];
  note: string;
  uninstall: string;
  native: NativeDistribution;
};

export const platforms: readonly InstallPlatform[] = [
  {
    id: "windows", name: "Windows", device: "desktop", subtitle: "在桌面上，专注每一次研究", browser: "推荐使用 Microsoft Edge 或 Google Chrome",
    steps: ["使用 Edge 或 Chrome 浏览器打开知线网站。", "点击地址栏中的安装图标，或在浏览器菜单中找到“应用”或“安装”相关选项。", "确认安装后，从开始菜单或浏览器的应用列表打开知线。"],
    note: "如果没有安装入口，请更新浏览器或继续使用网页版。安装的是网页版应用，目前没有 EXE 安装包。",
    uninstall: "从 Windows“设置 → 应用 → 已安装的应用”或浏览器的应用管理中卸载知线。", native: { status: "planned" },
  },
  {
    id: "macos", name: "macOS", device: "desktop", subtitle: "从程序坞，随时回到知线", browser: "推荐使用 Safari（macOS Sonoma 14 及以上）或 Google Chrome",
    steps: ["使用 Safari 或 Chrome 打开知线网站。", "支持的 Safari 中选择“文件 → 添加到程序坞”；Chrome 中点击地址栏安装图标或菜单中的安装选项。", "确认名称并添加，之后从程序坞或系统应用入口打开知线。"],
    note: "旧版 macOS/Safari 可尝试 Chrome，或继续在浏览器中使用。目前没有 DMG 安装包。",
    uninstall: "Safari 网页应用可从用户的“应用程序”文件夹移除；Chrome 安装的应用可从其应用管理中卸载。", native: { status: "planned" },
  },
  {
    id: "linux", name: "Linux", device: "desktop", subtitle: "让信息流融入你的工作环境", browser: "推荐使用 Google Chrome 或支持安装应用的 Chromium",
    steps: ["使用 Chrome 或支持的 Chromium 打开知线网站。", "点击地址栏安装图标，或在浏览器菜单中找到安装应用的选项。", "确认安装后，从浏览器应用列表或系统应用启动器打开知线。"],
    note: "具体菜单和应用启动器因浏览器与发行版而异。目前没有 AppImage、DEB 或 RPM 安装包。",
    uninstall: "通过对应浏览器的应用管理卸载知线；系统启动器中的移除方式因发行版而异。", native: { status: "planned" },
  },
  {
    id: "android", name: "Android", device: "mobile", subtitle: "手机在手，随时发现新变化", browser: "推荐使用 Android 版 Google Chrome",
    steps: ["使用 Chrome 打开知线；如果在微信等内置浏览器中，请先选择在系统浏览器中打开。", "打开浏览器菜单，选择“安装应用”或“添加到主屏幕”。", "按提示确认，然后从主屏幕或应用列表打开知线。"],
    note: "支持方式因浏览器而异，某些“添加到主屏幕”只会创建网页快捷方式。原生 Android 安装包尚未发布。",
    uninstall: "长按知线图标，按系统提示卸载应用或移除主屏幕快捷方式。", native: { status: "pending" },
  },
  {
    id: "ios", name: "iPhone / iPad", device: "mobile", subtitle: "把知线，放进你的主屏幕", browser: "推荐使用 iPhone 或 iPad 上的 Safari",
    steps: ["使用 Safari 打开知线网站；如果在内置浏览器中，请先在 Safari 中打开。", "点击分享按钮，找到并选择“添加到主屏幕”。", "确认添加；如果出现“作为网页 App 打开”，保持开启，之后从主屏幕打开知线。"],
    note: "iPhone 与 iPad 通过系统菜单添加，网页无法直接弹出安装确认。TestFlight 和 App Store 版本尚未发布。",
    uninstall: "长按主屏幕上的知线图标，按系统提示删除网页应用或移除图标。", native: { status: "pending" },
  },
];

export function detectPlatform(device: { userAgent: string; platform: string; maxTouchPoints: number }): PlatformId | null {
  if (/CrOS/i.test(device.userAgent)) return null;
  if (/iPhone|iPad|iPod/i.test(device.userAgent) || (device.platform === "MacIntel" && device.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(device.userAgent)) return "android";
  if (/Windows/i.test(device.userAgent)) return "windows";
  if (/Mac/i.test(device.userAgent)) return "macos";
  if (/Linux|X11/i.test(device.userAgent)) return "linux";
  return null;
}
