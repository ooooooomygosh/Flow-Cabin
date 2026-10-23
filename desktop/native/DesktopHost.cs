// Original implementation using Win32. No third-party wallpaper runtime.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

class DesktopHost {
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int left, top, right, bottom; }
  [StructLayout(LayoutKind.Sequential)] struct POINT { public int x,y; }
  [StructLayout(LayoutKind.Sequential)] struct MONITORINFO { public int cbSize; public RECT monitor, work; public uint flags; }
  delegate bool EnumProc(IntPtr hwnd, IntPtr param);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern IntPtr FindWindow(string cls,string title);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern IntPtr FindWindowEx(IntPtr parent,IntPtr after,string cls,string title);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc fn, IntPtr param);
  [DllImport("user32.dll", SetLastError=true)] static extern IntPtr SetParent(IntPtr child,IntPtr parent);
  [DllImport("user32.dll")] static extern IntPtr GetParent(IntPtr hwnd);
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] static extern IntPtr GetLong(IntPtr hwnd,int index);
  [DllImport("user32.dll", EntryPoint="SetWindowLongPtrW",SetLastError=true)] static extern IntPtr SetLong(IntPtr hwnd,int index,IntPtr value);
  [DllImport("user32.dll",SetLastError=true)] static extern bool SetWindowPos(IntPtr hwnd,IntPtr after,int x,int y,int width,int height,uint flags);
  [DllImport("user32.dll",SetLastError=true)] static extern bool SetLayeredWindowAttributes(IntPtr hwnd,uint key,byte alpha,uint flags);
  [DllImport("user32.dll")] static extern IntPtr SendMessageTimeout(IntPtr hwnd,uint msg,IntPtr w,IntPtr l,uint flags,uint timeout,out IntPtr result);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hwnd,out RECT rect);
  [DllImport("user32.dll")] static extern bool ScreenToClient(IntPtr hwnd,ref POINT point);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr hwnd,uint flags);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern bool GetMonitorInfo(IntPtr monitor,ref MONITORINFO info);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd,StringBuilder cls,int length);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr hwnd,uint cmd);
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
  // keep-bottom (桌面模式): an out-of-context WinEvent hook keeps our window at the
  // bottom of the z-order whenever anything raises it. No Explorer window is touched.
  [StructLayout(LayoutKind.Sequential)] struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam, lParam; public uint time; public POINT pt; }
  delegate void WinEventProc(IntPtr hook,uint ev,IntPtr hwnd,int idObject,int idChild,uint thread,uint time);
  [DllImport("user32.dll")] static extern IntPtr SetWinEventHook(uint min,uint max,IntPtr module,WinEventProc proc,uint pid,uint tid,uint flags);
  [DllImport("user32.dll")] static extern bool UnhookWinEvent(IntPtr hook);
  [DllImport("user32.dll")] static extern int GetMessage(out MSG msg,IntPtr hwnd,uint min,uint max);
  [DllImport("user32.dll")] static extern bool TranslateMessage(ref MSG msg);
  [DllImport("user32.dll")] static extern IntPtr DispatchMessage(ref MSG msg);
  [DllImport("user32.dll")] static extern bool PostThreadMessage(uint thread,uint msg,IntPtr w,IntPtr l);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  static WinEventProc keeper; // held so the delegate is never collected while hooked
  static void KeepBottom(IntPtr window,uint pid) {
    uint loop=GetCurrentThreadId();
    Action push=delegate { SetWindowPos(window,new IntPtr(1),0,0,0,0,0x0001|0x0002|0x0010|0x0200); }; // HWND_BOTTOM; NOSIZE|NOMOVE|NOACTIVATE|NOOWNERZORDER
    keeper=delegate(IntPtr hook,uint ev,IntPtr hwnd,int idObject,int idChild,uint thread,uint time) {
      if(!IsWindow(window)) { PostThreadMessage(loop,0x0012,IntPtr.Zero,IntPtr.Zero); return; }
      if(idObject!=0) return; // OBJID_WINDOW only
      if(ev==0x0003||hwnd==window) push();
    };
    var foreground=SetWinEventHook(0x0003,0x0003,IntPtr.Zero,keeper,0,0,0);     // EVENT_SYSTEM_FOREGROUND, any process
    var reorder=SetWinEventHook(0x8004,0x8004,IntPtr.Zero,keeper,pid,0,0);       // EVENT_OBJECT_REORDER in the cabin's process
    push();
    Console.WriteLine("{\"keeping\":true}"); Console.Out.Flush();
    // The parent closes stdin (or exits) to stop; the window closing also stops.
    var watcher=new Thread(delegate() { try { Console.In.ReadToEnd(); } catch {} PostThreadMessage(loop,0x0012,IntPtr.Zero,IntPtr.Zero); });
    watcher.IsBackground=true; watcher.Start();
    var timer=new Timer(delegate(object state) { if(!IsWindow(window)) PostThreadMessage(loop,0x0012,IntPtr.Zero,IntPtr.Zero); },null,2000,2000);
    MSG msg; while(GetMessage(out msg,IntPtr.Zero,0,0)>0) { TranslateMessage(ref msg); DispatchMessage(ref msg); }
    timer.Dispose(); if(foreground!=IntPtr.Zero) UnhookWinEvent(foreground); if(reorder!=IntPtr.Zero) UnhookWinEvent(reorder);
  }
  // fullscreen-watch (desktop/pet-fullscreen.cjs): the desktop pet hides while a fullscreen app is in front.
  [DllImport("shell32.dll")] static extern int SHQueryUserNotificationState(out int state);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern IntPtr GetShellWindow();
  static bool ForegroundCoversMonitor(uint ownPid) {
    var fg=GetForegroundWindow(); if(fg==IntPtr.Zero||fg==GetShellWindow()) return false;
    uint pid; GetWindowThreadProcessId(fg,out pid); if(pid==ownPid) return false;
    var cls=Class(fg); if(cls=="Progman"||cls=="WorkerW"||cls=="Shell_TrayWnd") return false;
    RECT rect; if(!GetWindowRect(fg,out rect)) return false;
    var info=new MONITORINFO(); info.cbSize=Marshal.SizeOf(info);
    if(!GetMonitorInfo(MonitorFromWindow(fg,2),ref info)) return false;
    return rect.left<=info.monitor.left&&rect.top<=info.monitor.top&&rect.right>=info.monitor.right&&rect.bottom>=info.monitor.bottom;
  }
  static void WatchFullscreen(IntPtr window,uint pid) {
    var stop=new ManualResetEvent(false);
    // The parent closes stdin (or exits) to stop; the pet window closing also stops.
    var watcher=new Thread(delegate() { try { Console.In.ReadToEnd(); } catch {} stop.Set(); });
    watcher.IsBackground=true; watcher.Start();
    int last=-1;
    while(!stop.WaitOne(1500)) {
      if(!IsWindow(window)) break;
      int state; bool busy=SHQueryUserNotificationState(out state)==0&&(state==2||state==3||state==4); // QUNS_BUSY, RUNNING_D3D_FULL_SCREEN, PRESENTATION_MODE
      int now=(busy||ForegroundCoversMonitor(pid))?1:0;
      if(now!=last) { last=now; Console.WriteLine(now==1?"{\"fullscreen\":true}":"{\"fullscreen\":false}"); Console.Out.Flush(); }
    }
  }
  static string Class(IntPtr h) { var s=new StringBuilder(256); GetClassName(h,s,s.Capacity); return s.ToString(); }
  static IntPtr Handle(string s) { return new IntPtr(long.Parse(s, CultureInfo.InvariantCulture)); }
  static void Guard(IntPtr window,uint expectedPid) { uint pid; GetWindowThreadProcessId(window,out pid); if(!IsWindow(window)||pid!=expectedPid||Class(window)!="Chrome_WidgetWin_1") throw new Exception("Invalid owned wallpaper window"); }
  static Dictionary<string,object> Probe(IntPtr window) {
    var parent=GetParent(window); RECT rect; GetWindowRect(window,out rect);
    var info=new MONITORINFO(); info.cbSize=Marshal.SizeOf(info);
    bool monitorFound=GetMonitorInfo(MonitorFromWindow(window,2),ref info);
    bool covers=monitorFound&&rect.left==info.monitor.left&&rect.top==info.monitor.top&&rect.right==info.monitor.right&&rect.bottom==info.monitor.bottom;
    bool hasFrame=(GetLong(window,-16).ToInt64()&0x00c40000L)!=0||(GetLong(window,-20).ToInt64()&0x301L)!=0;
    var icons=FindWindowEx(parent,IntPtr.Zero,"SHELLDLL_DefView",null);
    bool behind=false;
    if(Class(parent)=="WorkerW") {
      IntPtr iconHost=IntPtr.Zero;
      EnumWindows(delegate(IntPtr h,IntPtr p){if(FindWindowEx(h,IntPtr.Zero,"SHELLDLL_DefView",null)!=IntPtr.Zero) iconHost=h; return true;},IntPtr.Zero);
      // WorkerW selected by Attach is the sibling immediately behind the icon host.
      behind=iconHost!=IntPtr.Zero&&FindWindowEx(IntPtr.Zero,iconHost,"WorkerW",null)==parent;
    } else if(Class(parent)=="Progman"&&icons!=IntPtr.Zero) {
      // GetWindow(GW_HWNDPREV) walks toward the front of this sibling z-order.
      for(var h=GetWindow(window,3);h!=IntPtr.Zero;h=GetWindow(h,3)) if(h==icons) {behind=true;break;}
    }
    return new Dictionary<string,object>{{"parent",parent.ToInt64().ToString()},{"parentClass",Class(parent)},{"behindIcons",behind},{"visible",IsWindowVisible(window)},{"hasFrame",hasFrame},{"coversMonitor",covers},{"bounds",new {x=rect.left,y=rect.top,width=rect.right-rect.left,height=rect.bottom-rect.top}}};
  }
  static void Attach(IntPtr window,IntPtr owner) {
    var progman=FindWindow("Progman",null); if(progman==IntPtr.Zero) throw new Exception("Windows desktop unavailable");
    IntPtr result; SendMessageTimeout(progman,0x052c,new IntPtr(0xD),new IntPtr(1),2,1500,out result);
    var icons=FindWindowEx(progman,IntPtr.Zero,"SHELLDLL_DefView",null);
    var childWorker=FindWindowEx(progman,IntPtr.Zero,"WorkerW",null);
    bool modern=icons!=IntPtr.Zero&&childWorker!=IntPtr.Zero;
    IntPtr worker=IntPtr.Zero;
    if(!modern) {
      EnumWindows(delegate(IntPtr h,IntPtr p){if(FindWindowEx(h,IntPtr.Zero,"SHELLDLL_DefView",null)!=IntPtr.Zero) worker=FindWindowEx(IntPtr.Zero,h,"WorkerW",null); return true;},IntPtr.Zero);
      if(worker==IntPtr.Zero) {SendMessageTimeout(progman,0x052c,IntPtr.Zero,IntPtr.Zero,2,1500,out result); EnumWindows(delegate(IntPtr h,IntPtr p){if(FindWindowEx(h,IntPtr.Zero,"SHELLDLL_DefView",null)!=IntPtr.Zero) worker=FindWindowEx(IntPtr.Zero,h,"WorkerW",null);return true;},IntPtr.Zero);}
      if(worker==IntPtr.Zero) throw new Exception("Desktop wallpaper layer unavailable");
    }
    var parent=modern?progman:worker;
    // Change only our own window. Explorer and the user's saved wallpaper are untouched.
    var style=GetLong(window,-16).ToInt64(); SetLong(window,-16,new IntPtr((style&~0x80cf0000L)|0x40000000L));
    SetLong(window,-20,new IntPtr(GetLong(window,-20).ToInt64()&~0x301L));
    if(modern) {SetLong(window,-20,new IntPtr(GetLong(window,-20).ToInt64()|0x80000L)); if(!SetLayeredWindowAttributes(window,0,255,2)) throw new Exception("Cannot enable desktop composition");}
    SetParent(window,parent); if(GetParent(window)!=parent) throw new Exception("Cannot attach desktop wallpaper");
    var info=new MONITORINFO();info.cbSize=Marshal.SizeOf(info);if(!GetMonitorInfo(MonitorFromWindow(owner,2),ref info)) throw new Exception("Monitor unavailable");
    var point=new POINT{x=info.monitor.left,y=info.monitor.top}; ScreenToClient(parent,ref point);
    if(!SetWindowPos(window,modern?icons:new IntPtr(1),point.x,point.y,info.monitor.right-info.monitor.left,info.monitor.bottom-info.monitor.top,0x10|0x20|0x40)) throw new Exception("Cannot position desktop wallpaper");
  }
  static int Main(string[] args) {
    try {
      try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch(EntryPointNotFoundException) { }
      if(args.Length<3) throw new Exception("Command, window and owner process required");
      var window=Handle(args[1]); Guard(window,uint.Parse(args[2],CultureInfo.InvariantCulture));
      if(args[0]=="keep-bottom") { KeepBottom(window,uint.Parse(args[2],CultureInfo.InvariantCulture)); return 0; }
      if(args[0]=="fullscreen-watch") { WatchFullscreen(window,uint.Parse(args[2],CultureInfo.InvariantCulture)); return 0; }
      if(args[0]=="attach") { if(args.Length!=4)throw new Exception("Owner window required"); Attach(window,Handle(args[3])); }
      else if(args[0]!="probe") throw new Exception("Unknown command");
      Console.WriteLine(new JavaScriptSerializer().Serialize(Probe(window))); return 0;
    } catch(Exception e) {Console.Error.WriteLine(e.Message); return 1;}
  }
}
