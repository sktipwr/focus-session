"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import confetti from "canvas-confetti";
import { logSession, syncDaySummary, createUser, getUser, getAllUsers, recoverUser, getTeamDaily, getTeamStreaks, type AppUser, type TeamDayEntry, type TeamStreak } from "@/lib/supabase";

// ── CSS var shorthand ──
const V = {
  bg: "var(--color-bg)", surface: "var(--color-surface)", surfaceHover: "var(--color-surface-hover)",
  surfaceActive: "var(--color-surface-active)", surfaceSuccess: "var(--color-surface-success)",
  surfaceGlass: "var(--color-surface-glass)", border: "var(--color-border)",
  borderActive: "var(--color-border-active)", borderSuccess: "var(--color-border-success)",
  text: "var(--color-text)", muted: "var(--color-text-muted)", faint: "var(--color-text-faint)",
  inverse: "var(--color-text-inverse)", accent: "var(--color-accent)", accentHover: "var(--color-accent-hover)",
  accentSoft: "var(--color-accent-soft)", success: "var(--color-success)", successHover: "var(--color-success-hover)",
  warning: "var(--color-warning)", warningBg: "var(--color-warning-bg)", warningBorder: "var(--color-warning-border)",
  ringTrack: "var(--color-ring-track)", tabBg: "var(--color-tab-bg)",
} as const;

// ── Stickers ──
const STICKERS = { hype: [2, 3, 18, 23, 28], focus: [4, 14, 17, 19, 20], lazy: [1, 9, 13, 16, 29], fire: [3, 15, 26, 28, 30], celebrate: [2, 8, 18, 22, 25, 28] };
function randomSticker(cat: keyof typeof STICKERS): string { const p = STICKERS[cat]; return `/emoji/sticker_${p[Math.floor(Math.random() * p.length)]}.png`; }
function fireConfetti() { const d = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 }; confetti({ ...d, particleCount: 50, origin: { x: 0.2, y: 0.6 } }); confetti({ ...d, particleCount: 50, origin: { x: 0.8, y: 0.6 } }); setTimeout(() => confetti({ ...d, particleCount: 30, origin: { x: 0.5, y: 0.4 } }), 250); }

// ── Types ──
type TaskStatus = "pending" | "active" | "done" | "skipped";
interface TaskTemplate { id: string; label: string; emoji: string; duration: number; repeatable: boolean; isCustom?: boolean; }
interface Task extends TaskTemplate { status: TaskStatus; elapsed: number; completedCount: number; }
interface DayRecord { date: string; tasks: Task[]; totalMinutes: number; completedCount: number; totalCount: number; }
interface TodayData { date: string; tasks: Task[]; }

// ── Built-in tasks ──
const BUILTIN_TASKS: TaskTemplate[] = [
  { id: "morning-pages", label: "Morning Pages", emoji: "\u270D\uFE0F", duration: 15 * 60, repeatable: true },
  { id: "food", label: "Prepare Food", emoji: "\uD83C\uDF73", duration: 15 * 60, repeatable: false },
  { id: "journal", label: "Write Journal", emoji: "\uD83D\uDCD3", duration: 15 * 60, repeatable: false },
  { id: "exercise", label: "Exercise", emoji: "\uD83C\uDFCB\uFE0F", duration: 15 * 60, repeatable: false },
  { id: "study-1", label: "Study Session 1", emoji: "\uD83D\uDCDA", duration: 30 * 60, repeatable: true },
  { id: "study-2", label: "Study Session 2", emoji: "\uD83D\uDCDA", duration: 30 * 60, repeatable: true },
  { id: "study-3", label: "Study Session 3", emoji: "\uD83D\uDCDA", duration: 30 * 60, repeatable: true },
];

// ── localStorage ──
const CK = "nn-custom-tasks", HK = "nn-hidden-tasks", TK = "nn-today", HIS = "nn-history", OK = "nn-overrides", UK = "nn-user";
const USER_EMOJIS = ["\uD83D\uDE0E", "\uD83E\uDD29", "\uD83E\uDD16", "\uD83D\uDC7B", "\uD83E\uDDD9", "\uD83E\uDDDE", "\uD83E\uDDB8", "\uD83E\uDD8A", "\uD83D\uDC3C", "\uD83E\uDD85", "\uD83C\uDF4B", "\uD83C\uDF1F"];

function loadUser(): { id: string; name: string; emoji: string } | null {
  try { const u = localStorage.getItem(UK); return u ? JSON.parse(u) : null; } catch { return null; }
}
function saveUser(u: { id: string; name: string; emoji: string }) {
  localStorage.setItem(UK, JSON.stringify(u));
}
function loadC(): TaskTemplate[] { try { return JSON.parse(localStorage.getItem(CK)||"[]"); } catch { return []; } }
function saveC(t: TaskTemplate[]) { localStorage.setItem(CK, JSON.stringify(t)); }
function loadH(): string[] { try { return JSON.parse(localStorage.getItem(HK)||"[]"); } catch { return []; } }
function saveH(ids: string[]) { localStorage.setItem(HK, JSON.stringify(ids)); }
function loadOverrides(): Record<string, Partial<TaskTemplate>> { try { return JSON.parse(localStorage.getItem(OK)||"{}"); } catch { return {}; } }
function saveOverrides(o: Record<string, Partial<TaskTemplate>>) { localStorage.setItem(OK, JSON.stringify(o)); }

function buildTemplates(): TaskTemplate[] {
  if (typeof window === "undefined") return BUILTIN_TASKS;
  const hidden = loadH(), custom = loadC();
  const b = BUILTIN_TASKS.filter((t) => !hidden.includes(t.id));
  if (new Date().getDay() === 6 && !hidden.includes("record-video")) b.push({ id: "record-video", label: "Record a Video", emoji: "\uD83C\uDFA5", duration: 30 * 60, repeatable: false });
  const overrides = loadOverrides();
  const withOverrides = b.map((t) => overrides[t.id] ? { ...t, ...overrides[t.id] } : t);
  return [...withOverrides, ...custom.map((t) => ({ ...t, isCustom: true }))];
}
function freshTasks(): Task[] { return buildTemplates().map((t) => ({ ...t, status: "pending" as TaskStatus, elapsed: 0, completedCount: 0 })); }
function todayKey(): string { return new Date().toISOString().slice(0, 10); }
function loadToday(): TodayData {
  if (typeof window === "undefined") return { date: todayKey(), tasks: freshTasks() };
  try { const s = localStorage.getItem(TK); if (s) { const d: TodayData = JSON.parse(s); if (d.date === todayKey()) { const tmpl = buildTemplates(), ids = new Set(d.tasks.map(t=>t.id)); for (const t of tmpl) if (!ids.has(t.id)) d.tasks.push({...t,status:"pending",elapsed:0,completedCount:0}); const tids = new Set(tmpl.map(t=>t.id)); d.tasks = d.tasks.filter(t=>tids.has(t.id)); return d; } archiveDay(d); } } catch {} return { date: todayKey(), tasks: freshTasks() };
}
function saveToday(d: TodayData) { try { localStorage.setItem(TK, JSON.stringify(d)); } catch {} }
function archiveDay(d: TodayData) { const c = d.tasks.filter(t=>t.status==="done").length; if (!c) return; try { const h: DayRecord[] = JSON.parse(localStorage.getItem(HIS)||"[]"); if (!h.some(x=>x.date===d.date)) { h.unshift({date:d.date,tasks:d.tasks,totalMinutes:d.tasks.reduce((s,t)=>s+t.completedCount*(t.duration/60),0),completedCount:c,totalCount:d.tasks.length}); if(h.length>30)h.pop(); localStorage.setItem(HIS,JSON.stringify(h)); } } catch {} }
function loadHistory(): DayRecord[] { if (typeof window === "undefined") return []; try { return JSON.parse(localStorage.getItem(HIS)||"[]"); } catch { return []; } }

// ── Helpers ──
function fmt(s: number): string { return `${Math.floor(s/60).toString().padStart(2,"0")}:${(s%60).toString().padStart(2,"0")}`; }
function fmtDate(d: string): string { return new Date(d+"T00:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"}); }
function getStreak(h: DayRecord[]): number { if(!h.length) return 0; let s=0; const sorted=[...h].sort((a,b)=>b.date.localeCompare(a.date)); for(let i=0;i<sorted.length;i++){const d=new Date();d.setDate(d.getDate()-i);const exp=d.toISOString().slice(0,10);if(sorted[i]?.date===exp&&sorted[i].completedCount>0)s++;else if(i===0&&sorted[0].date===todayKey()){s++;continue;}else break;} return s; }

const QUOTES=["Discipline is choosing between what you want now and what you want most.","The secret of getting ahead is getting started.","Small daily improvements are the key to staggering long-term results.","You don't have to be extreme, just consistent.","Your future self is watching you right now through memories.","One focused hour is worth more than a distracted day.","Don't break the chain. Show up every single day.","Hard choices, easy life. Easy choices, hard life."];
const SUCCESS_MSGS=["Crushed it!","That's what consistency looks like.","Future you is grateful.","You showed up. That's what matters.","Another brick in the wall of discipline.","Your focus muscle just got stronger.","No excuses. You did it right."];
const TIMER_MSGS=["Stay locked in. Distractions are temporary.","This is your time. Own it.","Deep focus. The world can wait.","Every second compounds into greatness."];
const EMOJI_OPTIONS=["\uD83D\uDCDA","\u270D\uFE0F","\uD83C\uDFCB\uFE0F","\uD83E\uDDD8","\uD83C\uDFA8","\uD83C\uDFB5","\uD83D\uDCBB","\uD83E\uDDE0","\uD83C\uDFA5","\uD83C\uDF73","\uD83D\uDCD3","\u2615"];
const DUR_OPTS=[5,10,15,20,30,45,60];

// ── Timer Ring ──
function TimerRing({progress,size=220,stroke=10,overtime=false}:{progress:number;size?:number;stroke?:number;overtime?:boolean}) {
  const r=(size-stroke)/2,c=2*Math.PI*r,off=c*(1-progress);
  return (<svg width={size} height={size} className="transform -rotate-90"><defs><linearGradient id="gt" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor={V.accent}/><stop offset="50%" stopColor="var(--color-accent-gradient-mid)"/><stop offset="100%" stopColor="var(--color-accent-gradient-end)"/></linearGradient><linearGradient id="go" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor={V.success}/><stop offset="100%" stopColor={V.warning}/></linearGradient></defs><circle cx={size/2} cy={size/2} r={r} fill="none" stroke={V.ringTrack} strokeWidth={stroke}/><circle cx={size/2} cy={size/2} r={r} fill="none" stroke={overtime?"rgba(106,191,64,0.08)":V.accentSoft} strokeWidth={stroke+14} strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" className="transition-all duration-1000 ease-linear"/><circle cx={size/2} cy={size/2} r={r} fill="none" stroke={`url(#${overtime?"go":"gt"})`} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" className="transition-all duration-1000 ease-linear"/></svg>);
}

// ── Week strip with history dots ──
function WeekStrip({ history, todayCompleted, todayTotal }: { history: DayRecord[]; todayCompleted: number; todayTotal: number }) {
  const today = new Date();
  const histMap = new Map(history.map((d) => [d.date, d]));
  const days: { label: string; date: number; dateStr: string; isToday: boolean; isFuture: boolean; completed: number; total: number }[] = [];
  for (let i = -3; i <= 3; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    const ds = d.toISOString().slice(0, 10);
    const rec = histMap.get(ds);
    const isToday = i === 0;
    const isFuture = i > 0;
    days.push({
      label: d.toLocaleDateString("en-US", { weekday: "short" }),
      date: d.getDate(), dateStr: ds, isToday, isFuture,
      completed: isToday ? todayCompleted : (rec?.completedCount || 0),
      total: isToday ? todayTotal : (rec?.totalCount || 0),
    });
  }
  return (
    <div className="flex justify-between px-2">
      {days.map((d, i) => {
        const hasActivity = d.completed > 0;
        const ratio = d.total > 0 ? d.completed / d.total : 0;
        return (
          <div key={i} className="flex flex-col items-center gap-1">
            <span className="text-[10px]" style={{ color: d.isToday ? V.accent : V.faint }}>{d.label}</span>
            <div className="relative">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all"
                style={{
                  background: d.isToday ? V.accent : hasActivity ? V.accentSoft : "transparent",
                  color: d.isToday ? V.inverse : hasActivity ? V.accent : d.isFuture ? V.faint : V.muted,
                  border: hasActivity && !d.isToday ? `1px solid ${V.borderActive}` : "none",
                }}>
                {d.date}
              </div>
              {/* Completion dot */}
              {hasActivity && !d.isToday && (
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full"
                  style={{ background: ratio >= 1 ? V.success : ratio > 0.5 ? V.accent : V.warning }} />
              )}
              {d.isToday && todayCompleted > 0 && (
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full"
                  style={{ background: ratio >= 1 ? V.success : V.accent }} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Rolling time display — only changed digits animate ──
function RollingTime({ time, color }: { time: string; color: string }) {
  return (
    <div className="flex items-center justify-center font-mono font-bold" style={{ fontSize: "3rem", lineHeight: "3.25rem", color }}>
      {time.split("").map((char, i) => (
        char === ":" ? (
          <span key="colon" className="mx-0.5 opacity-60">:</span>
        ) : (
          <span key={`${i}-${char}`} className="inline-block overflow-hidden" style={{ width: "1.8rem", height: "3.25rem" }}>
            <span className="inline-block digit-roll">{char}</span>
          </span>
        )
      ))}
    </div>
  );
}

type Tab = "home"|"timer"|"insights";
type TState = "idle"|"running"|"paused"|"overtime"|"success";

export default function Home() {
  const [dayData,setDayData]=useState<TodayData>({date:todayKey(),tasks:freshTasks()});
  const [tab,setTab]=useState<Tab>("home");
  const [ts,setTs]=useState<TState>("idle");
  const [activeIdx,setActiveIdx]=useState(-1);
  const [mounted,setMounted]=useState(false);
  const [splash,setSplash]=useState(true);
  const [userSetup,setUserSetup]=useState(false); // show user setup after splash
  const [currentUser,setCurrentUser]=useState<{id:string;name:string;emoji:string}|null>(null);
  const [history,setHistory]=useState<DayRecord[]>([]);
  const [editMode,setEditMode]=useState(false);
  const [editingId,setEditingId]=useState<string|null>(null);
  const [showAdd,setShowAdd]=useState(false);
  const [installPrompt,setInstallPrompt]=useState<Event|null>(null);
  const [teamData,setTeamData]=useState<TeamDayEntry[]>([]);
  const [teamStreaks,setTeamStreaks]=useState<TeamStreak[]>([]);
  const [allUsers,setAllUsers]=useState<AppUser[]>([]);
  const iRef=useRef<ReturnType<typeof setInterval>|null>(null);
  // Wall-clock tracking: store when timer started and elapsed-at-pause
  const timerStartRef=useRef<number>(0); // Date.now() when timer started/resumed
  const elapsedAtPauseRef=useRef<number>(0); // elapsed seconds when paused
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wakeLockRef=useRef<any>(null);
  const notifiedRef=useRef(false); // prevent duplicate notifications

  const tasks=dayData.tasks, running=ts==="running", overtime=ts==="overtime";
  const uT=useCallback((fn:(t:Task[])=>Task[])=>{setDayData(p=>({...p,tasks:fn(p.tasks)}));},[]);

  // ── Request notification permission on mount ──
  useEffect(()=>{
    setDayData(loadToday());setHistory(loadHistory());setMounted(true);
    // Load user
    const u = loadUser();
    if (u) { setCurrentUser(u); }
    else { setUserSetup(true); }
    // Load team data
    getTeamDaily(7).then(setTeamData);
    getTeamStreaks().then(setTeamStreaks);
    getAllUsers().then(setAllUsers);
    if("serviceWorker"in navigator)navigator.serviceWorker.register("/sw.js").catch(()=>{});
    // Request notification permission
    if("Notification"in window&&Notification.permission==="default") Notification.requestPermission();
    const h=(e:Event)=>{e.preventDefault();setInstallPrompt(e);};
    window.addEventListener("beforeinstallprompt",h);
    const at=()=>{const hr=new Date().getHours(),il=hr>=6&&hr<18;document.documentElement.classList.toggle("light",il);document.querySelector('meta[name="theme-color"]')?.setAttribute("content",il?"#faf8f2":"#0c0c0e");};
    at();const ti=setInterval(at,60000);
    return()=>{window.removeEventListener("beforeinstallprompt",h);clearInterval(ti);};
  },[]);

  useEffect(()=>{if(!mounted)return;saveToday(dayData);if(currentUser&&dayData.tasks.some(t=>t.status==="done"))syncDaySummary(currentUser.id,dayData.date,dayData.tasks.map(t=>({id:t.id,label:t.label,status:t.status,completedCount:t.completedCount,duration:t.duration})));},[dayData,mounted,currentUser]);

  // ── Wake Lock: keep screen on while timer is running ──
  useEffect(()=>{
    const acquire=async()=>{
      if(running&&"wakeLock"in navigator){
        try{ wakeLockRef.current=await navigator.wakeLock.request("screen"); }catch{}
      }
    };
    acquire();
    // Re-acquire on visibility change (wake lock releases when tab hidden)
    const onVis=()=>{ if(document.visibilityState==="visible"&&running) acquire(); };
    document.addEventListener("visibilitychange",onVis);
    return()=>{
      document.removeEventListener("visibilitychange",onVis);
      if(wakeLockRef.current){try{wakeLockRef.current.release();}catch{} wakeLockRef.current=null;}
    };
  },[running]);

  // ── Timer tick using wall clock ──
  const tsRef=useRef(ts); tsRef.current=ts;
  useEffect(()=>{
    if(running&&activeIdx>=0){
      // Record wall-clock start time
      timerStartRef.current=Date.now();
      notifiedRef.current=false;

      iRef.current=setInterval(()=>{
        // Compute elapsed from wall clock — survives background throttling
        const wallElapsed=Math.floor((Date.now()-timerStartRef.current)/1000);
        const totalElapsed=elapsedAtPauseRef.current+wallElapsed;

        uT(p=>{
          const n=[...p],t={...n[activeIdx]};
          t.elapsed=totalElapsed;
          if(t.elapsed>=t.duration&&tsRef.current!=="overtime"){
            setTs("overtime");
            // Send notification that timer is done
            if(!notifiedRef.current&&"Notification"in window&&Notification.permission==="granted"){
              notifiedRef.current=true;
              new Notification("Focusum",{body:`${t.label} timer complete! You're in overtime.`,icon:"/icon-192.png",tag:"timer-done"});
            }
          }
          n[activeIdx]=t;return n;
        });
      },1000);
    }
    return()=>{if(iRef.current)clearInterval(iRef.current);};
  },[running,activeIdx,uT]);

  const startTask=useCallback((i:number)=>{
    elapsedAtPauseRef.current=0;timerStartRef.current=Date.now();notifiedRef.current=false;
    uT(p=>{const n=[...p];n[i]={...n[i],status:"active",elapsed:0};return n;});
    setActiveIdx(i);setTs("running");setTab("timer");
  },[uT]);

  const pauseResume=useCallback(()=>{
    setTs(s=>{
      if(s==="running"){
        // Pausing: save current elapsed
        const wallElapsed=Math.floor((Date.now()-timerStartRef.current)/1000);
        elapsedAtPauseRef.current+=wallElapsed;
        return"paused";
      }
      if(s==="paused"){
        // Resuming: reset wall clock start
        timerStartRef.current=Date.now();
        return"running";
      }
      return s;
    });
  },[]);
  const finishTask=useCallback(()=>{const task=tasks[activeIdx];if(currentUser)logSession({user_id:currentUser.id,task_id:task.id,task_label:task.label,duration_planned:task.duration,duration_actual:task.elapsed,completed_at:new Date().toISOString(),date:dayData.date,was_overtime:task.elapsed>task.duration});uT(p=>{const n=[...p],t={...n[activeIdx]};t.status="done";t.completedCount+=1;n[activeIdx]=t;return n;});setTs("success");fireConfetti();getTeamDaily(7).then(setTeamData);},[activeIdx,tasks,dayData.date,uT,currentUser]);
  const skipTask=useCallback(()=>{uT(p=>{const n=[...p];n[activeIdx]={...n[activeIdx],status:"skipped"};return n;});setTs("idle");setTab("home");},[activeIdx,uT]);
  const repeatTask=useCallback((i:number)=>{uT(p=>{const n=[...p];n[i]={...n[i],status:"pending",elapsed:0};return n;});},[uT]);
  const untickTask=useCallback((i:number)=>{uT(p=>{const n=[...p],t={...n[i]};t.status="pending";t.elapsed=0;t.completedCount=Math.max(0,t.completedCount-1);n[i]=t;return n;});},[uT]);
  const resetAll=useCallback(()=>{setDayData({date:todayKey(),tasks:freshTasks()});setTs("idle");setActiveIdx(-1);},[]);
  const addTask=useCallback((tmpl:TaskTemplate)=>{const c=loadC();c.push(tmpl);saveC(c);uT(p=>[...p,{...tmpl,status:"pending" as TaskStatus,elapsed:0,completedCount:0}]);setShowAdd(false);},[uT]);
  const delTask=useCallback((id:string)=>{if(BUILTIN_TASKS.some(t=>t.id===id)||id==="record-video"){const h=loadH();h.push(id);saveH(h);}else saveC(loadC().filter(t=>t.id!==id));uT(p=>p.filter(t=>t.id!==id));},[uT]);
  const updTask=useCallback((id:string,u:Partial<TaskTemplate>)=>{
    const isBuiltin = BUILTIN_TASKS.some(t=>t.id===id) || id==="record-video";
    if (isBuiltin) { const o=loadOverrides(); o[id]={...(o[id]||{}), ...u}; saveOverrides(o); }
    else saveC(loadC().map(t=>t.id===id?{...t,...u}:t));
    uT(p=>p.map(t=>t.id===id?{...t,...u}:t)); setEditingId(null);
  },[uT]);

  if(!mounted)return<div className="flex items-center justify-center min-h-screen"><div style={{color:V.muted}}>Loading...</div></div>;

  if(splash)return(<div className="flex flex-col items-center justify-center min-h-screen text-center px-4 cursor-pointer" onClick={()=>setSplash(false)}><img src="/gonchu.webp" alt="Ghochu" className="w-40 h-40 object-contain mb-4 animate-pop-in animate-float"/><img src={randomSticker("hype")} alt="" className="w-12 h-12 mb-4 animate-sticker-drop" style={{animationDelay:"0.3s"}}/><h1 className="text-3xl font-bold mb-2 animate-fade-up" style={{animationDelay:"0.4s"}}>Hey{currentUser?` ${currentUser.name}`:""}</h1><p className="text-sm mb-8 animate-fade-up" style={{color:V.muted,animationDelay:"0.6s"}}>Let&apos;s crush your non-negotiables</p><p className="text-xs animate-pulse animate-fade-up" style={{color:V.faint,animationDelay:"0.8s"}}>tap to start</p></div>);

  // ── USER SETUP ──
  if(userSetup&&!currentUser)return(<UserSetup onComplete={(u)=>{setCurrentUser(u);saveUser(u);setUserSetup(false);getAllUsers().then(setAllUsers);}} existingUsers={allUsers}/>);

  const at=activeIdx>=0?tasks[activeIdx]:null;
  const rem=at?Math.max(0,at.duration-at.elapsed):0;
  const prog=at?Math.min(1,at.elapsed/at.duration):0;
  const cc=tasks.filter(t=>t.status==="done").length;
  const tm=tasks.reduce((s,t)=>s+t.completedCount*(t.duration/60),0);
  const streak=getStreak(history);
  const pct=tasks.length?Math.round((cc/tasks.length)*100):0;

  return (<div className="max-w-md mx-auto min-h-screen flex flex-col">

    {/* ══ HOME ══ */}
    {tab==="home"&&(<div className="flex-1 px-4 pt-6 pb-4 animate-fade-up">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full flex items-center justify-center text-xl" style={{background:V.surfaceHover}}>{currentUser?.emoji||"\uD83C\uDF4B"}</div><div><h1 className="font-semibold text-base">Hey, {currentUser?.name||"Gonchuuu"}!</h1><p className="text-xs" style={{color:V.muted}}>Let&apos;s begin your focus session</p></div></div>
        {!running&&<button onClick={()=>{setEditMode(!editMode);setEditingId(null);setShowAdd(false);}} className="w-9 h-9 rounded-full flex items-center justify-center" style={{background:editMode?V.accentSoft:V.surface,color:editMode?V.accent:V.muted,border:`1px solid ${editMode?V.borderActive:V.border}`}}><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" stroke="currentColor" strokeWidth="1.5"/></svg></button>}
      </div>

      {!editMode&&<div className="p-5 rounded-2xl mb-5 flex items-center gap-5 animate-scale-in" style={{background:`linear-gradient(135deg, ${V.surface} 0%, ${V.surfaceActive} 100%)`,border:`1px solid ${V.border}`}}>
        <div className="relative w-20 h-20 flex-shrink-0"><svg width="80" height="80" className="transform -rotate-90"><circle cx="40" cy="40" r="34" fill="none" stroke={V.ringTrack} strokeWidth="6"/><circle cx="40" cy="40" r="34" fill="none" stroke={V.accent} strokeWidth="6" strokeDasharray={2*Math.PI*34} strokeDashoffset={2*Math.PI*34*(1-pct/100)} strokeLinecap="round" className="transition-all duration-500"/></svg><div className="absolute inset-0 flex items-center justify-center"><span className="text-lg font-bold" style={{color:V.accent}}>{pct}%</span></div></div>
        <div><p className="font-semibold text-sm mb-0.5">Track Your Progress</p><p className="text-xs" style={{color:V.muted}}>{cc}/{tasks.length} tasks complete today</p>{streak>0&&<p className="text-xs mt-1" style={{color:V.accent}}>&#128293; {streak} day streak</p>}</div>
      </div>}

      {!editMode&&<div className="mb-5"><WeekStrip history={history} todayCompleted={cc} todayTotal={tasks.length}/></div>}
      {editMode&&<p className="text-xs italic text-center mb-4" style={{color:V.faint}}>Your non-negotiables. No excuses.</p>}

      <div className="space-y-2.5 stagger">
        {tasks.map((task,idx)=>(<div key={task.id}>{editingId===task.id?<TaskEditForm task={task} onSave={u=>updTask(task.id,u)} onCancel={()=>setEditingId(null)}/>:
          <div className="flex items-center gap-3 p-3.5 rounded-xl animate-fade-up card-lift" style={{background:task.status==="done"?V.surfaceSuccess:V.surface,border:`1px solid ${task.status==="done"?V.borderSuccess:V.border}`,opacity:task.status==="skipped"?0.4:1}}>
            <span className="text-xl">{task.emoji}</span>
            <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate" style={{color:task.status==="done"&&!task.repeatable?V.muted:V.text,textDecoration:task.status==="done"&&!task.repeatable?"line-through":"none"}}>{task.label}</p><p className="text-xs" style={{color:V.faint}}>{task.duration/60} min{task.completedCount>0&&<span style={{color:V.success}}> &#10003; {task.completedCount}x</span>}</p></div>
            {/* Edit/Delete — always visible, subtle */}
            {editMode && (
              <div className="flex gap-1">
                <button onClick={()=>setEditingId(task.id)} className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] transition-colors hover:opacity-80" style={{color:V.muted,background:V.surfaceHover}}>
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" stroke="currentColor" strokeWidth="1.5"/></svg>Edit
                </button>
                <button onClick={()=>delTask(task.id)} className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] transition-colors hover:opacity-80" style={{color:"#d44",background:"rgba(221,68,68,0.08)"}}>
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>Del
                </button>
              </div>
            )}
            {/* Action button */}
            {!editMode && (task.status==="done"&&task.repeatable?<button onClick={()=>repeatTask(idx)} className="text-xs font-medium px-2.5 py-1 rounded-full" style={{background:V.accentSoft,color:V.accent}}>Again</button>
            :task.status==="done"?<button onClick={()=>untickTask(idx)} className="text-base" style={{color:V.success}}>&#10003;</button>
            :task.status==="skipped"?<span className="text-xs" style={{color:V.muted}}>skipped</span>
            :<button onClick={()=>startTask(idx)} className="btn-press text-xs font-semibold px-3 py-1.5 rounded-full" style={{background:V.accent,color:V.inverse}}>Start</button>)}
          </div>}</div>))}
        {editMode&&!showAdd&&<button onClick={()=>setShowAdd(true)} className="w-full p-3.5 rounded-xl border-2 border-dashed text-xs font-medium animate-fade-up" style={{borderColor:V.border,color:V.muted}}>+ Add Session</button>}
        {showAdd&&<TaskAddForm onAdd={addTask} onCancel={()=>setShowAdd(false)}/>}
      </div>
      {!editMode&&cc>0&&<button onClick={resetAll} className="w-full text-xs py-3 mt-4" style={{color:V.faint}}>Reset all sessions</button>}
    </div>)}

    {/* ══ TIMER ══ */}
    {tab==="timer"&&(<div className="flex-1 flex flex-col items-center justify-center px-4 animate-fade-up">
      {ts==="idle"?<div className="text-center"><img src={randomSticker("lazy")} alt="" className="w-16 h-16 mx-auto mb-4 animate-sticker-drop"/><p className="text-lg font-semibold mb-2">No active timer</p><p className="text-sm mb-6" style={{color:V.muted}}>Pick a task from Home to start</p><button onClick={()=>setTab("home")} className="btn-press px-6 py-2.5 rounded-full text-sm font-semibold" style={{background:V.accent,color:V.inverse}}>Go to Home</button></div>
      :ts==="success"&&at?<div className="text-center"><img src={randomSticker("celebrate")} alt="" className="w-16 h-16 mx-auto mb-3 animate-pop-in"/><h2 className="text-xl font-bold mb-1">Nice work!</h2><p className="text-sm italic mb-3" style={{color:V.accent}}>{SUCCESS_MSGS[Math.floor(Math.random()*SUCCESS_MSGS.length)]}</p><p className="text-sm mb-1" style={{color:V.muted}}>Completed <span style={{color:V.text}} className="font-medium">{at.label}</span></p><p className="text-xs mb-6" style={{color:V.muted}}>{cc}/{tasks.length} done</p><div className="flex gap-2 justify-center mb-6">{tasks.map(t=><div key={t.id} className="w-2.5 h-2.5 rounded-full" style={{background:t.status==="done"?V.success:V.border}}/>)}</div><button onClick={()=>{setTs("idle");setTab("home");}} className="btn-press px-8 py-3 rounded-full font-semibold text-sm animate-shimmer" style={{background:V.accent,color:V.inverse}}>{tasks.every(t=>t.status==="done"||t.status==="skipped")?"See Insights":"Next Session"}</button></div>
      :at?<>
        <div className="mb-4 px-3 py-1.5 rounded-full animate-fade-down" style={{background:V.warningBg,border:`1px solid ${V.warningBorder}`}}><p className="text-[10px] font-medium" style={{color:V.warning}}>&#128244; DND for zero distractions</p></div>
        <div className="flex items-center gap-2 mb-6"><span className="text-2xl">{at.emoji}</span><div><h2 className="text-sm font-semibold">{at.label}</h2><p className="text-[10px]" style={{color:V.muted}}>{activeIdx+1} of {tasks.length}</p></div><img src={overtime?randomSticker("fire"):running?randomSticker("focus"):randomSticker("lazy")} alt="" className={`w-7 h-7 ml-1 ${overtime?"animate-pop-in":""}`} key={`${ts}`}/></div>
        <div className={`relative mb-6 ring-breathe ${overtime?"timer-glow-overtime":"timer-glow"}`}><TimerRing progress={overtime?1:prog} size={260} stroke={12} overtime={overtime}/><div className="absolute inset-0 flex flex-col items-center justify-center">{overtime&&<span className="text-[10px] font-bold tracking-widest uppercase mb-1" style={{color:V.success}}>Overtime</span>}<RollingTime time={overtime?`+${fmt(at.elapsed-at.duration)}`:fmt(rem)} color={overtime?V.success:V.text}/><span className="text-[10px] mt-1" style={{color:V.muted}}>{overtime?"finish when ready":running?"focusing":"paused"}</span></div></div>
        <div className="flex flex-col items-center gap-3 w-full max-w-[280px]">{overtime?<><button onClick={finishTask} className="btn-press w-full py-3.5 rounded-xl font-semibold text-base" style={{background:V.success,color:V.inverse}}>Finish Session</button><button onClick={pauseResume} className="text-sm" style={{color:V.muted}}>{running?"Pause":"Resume"}</button></>:<><button onClick={pauseResume} className="btn-press w-full py-3.5 rounded-xl font-semibold text-base" style={{background:V.accent,color:V.inverse}}>{running?"Pause":"Resume"}</button><div className="flex gap-8"><button onClick={skipTask} className="text-sm" style={{color:V.faint}}>Skip</button><button onClick={finishTask} className="text-sm font-medium" style={{color:V.success}}>Mark Done</button></div></>}</div>
        <p className="mt-6 text-[11px] italic text-center max-w-xs" style={{color:V.faint}}>{TIMER_MSGS[activeIdx%TIMER_MSGS.length]}</p>
      </>:null}
    </div>)}

    {/* ══ INSIGHTS ══ */}
    {tab==="insights"&&(<div className="flex-1 px-4 pt-6 pb-4 animate-fade-up">
      <h1 className="text-lg font-bold mb-5 text-center">Insights</h1>
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="p-4 rounded-xl text-center" style={{background:V.surface,border:`1px solid ${V.border}`}}><p className="text-2xl font-bold" style={{color:V.accent}}>{Math.round(tm)}<span className="text-xs font-normal" style={{color:V.muted}}>m</span></p><p className="text-[10px] mt-0.5" style={{color:V.muted}}>Focus Today</p></div>
        <div className="p-4 rounded-xl text-center" style={{background:V.surface,border:`1px solid ${V.border}`}}><p className="text-2xl font-bold" style={{color:V.success}}>{cc}<span className="text-xs font-normal" style={{color:V.muted}}>/{tasks.length}</span></p><p className="text-[10px] mt-0.5" style={{color:V.muted}}>Completed</p></div>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="p-4 rounded-xl text-center" style={{background:V.surface,border:`1px solid ${V.border}`}}><p className="text-2xl font-bold">&#128293; {streak}</p><p className="text-[10px] mt-0.5" style={{color:V.muted}}>Current Streak</p></div>
        <div className="p-4 rounded-xl text-center" style={{background:V.surface,border:`1px solid ${V.border}`}}><p className="text-2xl font-bold">{(()=>{let l=streak;if(history.length>1){const s=[...history].sort((a,b)=>a.date.localeCompare(b.date));let r=1;for(let i=1;i<s.length;i++){const diff=(new Date(s[i].date+"T00:00:00").getTime()-new Date(s[i-1].date+"T00:00:00").getTime())/86400000;if(diff===1&&s[i].completedCount>0){r++;if(r>l)l=r;}else r=s[i].completedCount>0?1:0;}}return l;})()}</p><p className="text-[10px] mt-0.5" style={{color:V.muted}}>Best Streak</p></div>
      </div>

      {/* Weekly chart */}
      <div className="p-4 rounded-xl mb-5" style={{background:V.surface,border:`1px solid ${V.border}`}}>
        <p className="text-xs font-medium mb-3">Your Focus Journey</p>
        <div className="flex items-end gap-2 h-28">{(()=>{const days:{l:string;m:number}[]=[];for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const ds=d.toISOString().slice(0,10);const rec=history.find(h=>h.date===ds);days.push({l:d.toLocaleDateString("en-US",{weekday:"short"}),m:ds===todayKey()?tm:(rec?.totalMinutes||0)});}const mx=Math.max(...days.map(d=>d.m),1);return days.map((d,i)=>(<div key={i} className="flex-1 flex flex-col items-center gap-1"><div className="w-full rounded-t-md transition-all" style={{height:`${Math.max(4,(d.m/mx)*100)}%`,background:d.m>0?V.accent:V.border}}/><span className="text-[9px]" style={{color:V.faint}}>{d.l}</span></div>));})()}</div>
      </div>

      {/* Contribution grid */}
      <div className="p-4 rounded-xl mb-5" style={{background:V.surface,border:`1px solid ${V.border}`}}>
        <div className="flex justify-between items-center mb-3"><p className="text-xs font-medium">Consistency</p><div className="flex items-center gap-1 text-[9px]" style={{color:V.faint}}><span>Less</span>{[V.surface,"var(--color-grid-1)","var(--color-grid-2)","var(--color-grid-3)",V.success].map((c,i)=>(<div key={i} className="w-2 h-2 rounded-sm" style={{background:c,border:i===0?`1px solid ${V.border}`:"none"}}/>))}<span>More</span></div></div>
        <div className="flex gap-[3px]"><div className="flex flex-col gap-[3px] mr-1" style={{color:V.faint,fontSize:"8px",lineHeight:"11px"}}><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div>
        {(()=>{const hm=new Map(history.map(d=>[d.date,d]));const weeks:React.ReactNode[]=[];const today=new Date();const start=new Date(today);start.setDate(today.getDate()-34);const d0=start.getDay();start.setDate(start.getDate()-(d0===0?6:d0-1));const cur=new Date(start);for(let w=0;w<5;w++){const cells:React.ReactNode[]=[];for(let d=0;d<7;d++){const ds=cur.toISOString().slice(0,10);const rec=hm.get(ds);const isFut=cur>today;const isToday=ds===todayKey();let lvl=0;const comp=isToday?cc:(rec?.completedCount||0);const tot=isToday?tasks.length:(rec?.totalCount||1);if(!isFut&&comp>0){const r=comp/tot;lvl=r<0.33?1:r<0.66?2:r<1?3:4;}const cols=[V.surface,"var(--color-grid-1)","var(--color-grid-2)","var(--color-grid-3)",V.success];cells.push(<div key={ds} className="w-[11px] h-[11px] rounded-[2px]" style={{background:isFut?"transparent":cols[lvl],border:isToday?`1.5px solid ${V.accent}`:lvl===0&&!isFut?`1px solid ${V.border}`:"none",opacity:isFut?0.15:1}}/>);cur.setDate(cur.getDate()+1);}weeks.push(<div key={w} className="flex flex-col gap-[3px] flex-1">{cells}</div>);}return weeks;})()}
        </div>
      </div>

      {history.length>0&&<div><p className="text-xs font-medium mb-2" style={{color:V.muted}}>Recent</p><div className="space-y-2">{history.slice(0,5).map(day=>(<div key={day.date} className="flex items-center gap-3 p-3 rounded-xl" style={{background:V.surface,border:`1px solid ${V.border}`}}><div className="flex gap-1">{day.tasks.slice(0,4).map(t=><span key={t.id} className="text-sm">{t.emoji}</span>)}</div><div className="flex-1"><p className="text-xs font-medium">{fmtDate(day.date)}</p></div><p className="text-xs font-semibold" style={{color:V.success}}>{day.completedCount}/{day.totalCount}</p></div>))}</div></div>}

      {/* ══ TEAM SECTION ══ */}
      {(teamStreaks.length>0||teamData.length>0)&&<>
        <div className="mt-6 mb-3 flex items-center gap-2"><div className="h-px flex-1" style={{background:V.border}}/><span className="text-[10px] font-bold tracking-widest uppercase" style={{color:V.faint}}>Team</span><div className="h-px flex-1" style={{background:V.border}}/></div>

        {/* Team streaks */}
        {teamStreaks.length>0&&<div className="space-y-2 mb-4">
          {teamStreaks.map(u=>(
            <div key={u.name} className="flex items-center gap-3 p-3 rounded-xl" style={{background:V.surface,border:`1px solid ${V.border}`}}>
              <span className="text-xl">{u.emoji}</span>
              <div className="flex-1"><p className="text-sm font-medium">{u.name}</p><p className="text-[10px]" style={{color:V.faint}}>Best: {u.best_streak} days</p></div>
              <div className="text-right"><p className="text-sm font-bold" style={{color:V.accent}}>&#128293; {u.current_streak}</p><p className="text-[10px]" style={{color:V.faint}}>streak</p></div>
            </div>
          ))}
        </div>}

        {/* Team today */}
        {teamData.length>0&&<div className="mb-4">
          <p className="text-xs font-medium mb-2" style={{color:V.muted}}>Team Activity</p>
          <div className="space-y-2">
            {teamData.slice(0,10).map((e,i)=>(
              <div key={`${e.date}-${e.name}-${i}`} className="flex items-center gap-3 p-3 rounded-xl" style={{background:V.surface,border:`1px solid ${V.border}`}}>
                <span className="text-lg">{e.emoji}</span>
                <div className="flex-1"><p className="text-xs font-medium">{e.name}</p><p className="text-[10px]" style={{color:V.faint}}>{fmtDate(e.date)}</p></div>
                <div className="text-right"><p className="text-xs font-semibold" style={{color:V.success}}>{e.completed_tasks}/{e.total_tasks}</p><p className="text-[10px]" style={{color:V.faint}}>{e.total_minutes}m</p></div>
              </div>
            ))}
          </div>
        </div>}

        {/* Switch user */}
        <button onClick={()=>{localStorage.removeItem(UK);setCurrentUser(null);setUserSetup(true);}} className="w-full text-xs py-2 mt-2" style={{color:V.faint}}>Switch User</button>
      </>}
    </div>)}

    {/* ══ BOTTOM TAB BAR ══ */}
    <div className="fixed bottom-0 left-0 right-0 z-40"><div className="max-w-md mx-auto px-4 pb-2"><div className="flex items-center justify-around py-2 px-3 rounded-2xl glass" style={{background:V.tabBg,border:`1px solid ${V.border}`}}>
      {([{id:"home" as Tab,label:"Home",icon:<path d="M3 9.5L8 4l5 5.5V14a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/>},{id:"timer" as Tab,label:"Timer",icon:<><circle cx="8" cy="8" r="6"/><path d="M8 4v4l2.5 1.5"/></>},{id:"insights" as Tab,label:"Insights",icon:<path d="M2 13V8M6 13V5M10 13V7M14 13V3"/>}]).map(({id,label,icon})=>(
        <button key={id} onClick={()=>setTab(id)} className={`flex flex-col items-center gap-0.5 px-5 py-1.5 rounded-xl transition-all ${tab===id?"tab-bounce":""}`} style={{color:tab===id?V.accent:V.faint,background:tab===id?V.accentSoft:"transparent"}}>
          <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
          <span className="text-[10px] font-medium">{label}</span>
        </button>))}
    </div></div></div>
  </div>);
}

// ── Forms ──
// ── User Setup Screen ──
function UserSetup({ onComplete, existingUsers }: { onComplete: (u: { id: string; name: string; emoji: string }) => void; existingUsers: AppUser[] }) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("\uD83D\uDE0E");
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [pin, setPin] = useState("");
  const [recoverName, setRecoverName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    const user = await createUser(name.trim(), emoji, pin || undefined);
    if (user) {
      onComplete({ id: user.id, name: user.name, emoji: user.emoji });
    } else {
      // Fallback: create local-only user
      const localUser = { id: `local-${Date.now()}`, name: name.trim(), emoji };
      onComplete(localUser);
    }
    setLoading(false);
  };

  const handleRecover = async () => {
    if (!recoverName.trim() || !pin.trim()) { setError("Enter name and PIN"); return; }
    setLoading(true);
    const user = await recoverUser(recoverName.trim(), pin.trim());
    if (user) {
      onComplete({ id: user.id, name: user.name, emoji: user.emoji });
    } else {
      setError("No account found with that name and PIN");
    }
    setLoading(false);
  };

  return (
    <div className="max-w-sm mx-auto px-4 flex flex-col items-center justify-center min-h-screen">
      <img src="/gonchu.webp" alt="" className="w-24 h-24 object-contain mb-4 animate-pop-in" />
      <h1 className="text-xl font-bold mb-1 animate-fade-up">Welcome to Focusum</h1>
      <p className="text-xs mb-6 animate-fade-up" style={{ color: V.muted }}>Your non-negotiables. No excuses.</p>

      {mode === "new" ? (
        <div className="w-full animate-fade-up" style={{ animationDelay: "0.2s" }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={20}
            className="w-full px-4 py-3 rounded-xl text-sm mb-3 outline-none text-center font-medium"
            style={{ background: V.surface, border: `1px solid ${V.border}`, color: V.text }} />

          <p className="text-[10px] mb-2 text-center" style={{ color: V.faint }}>Pick your avatar</p>
          <div className="flex gap-2 flex-wrap justify-center mb-4">
            {USER_EMOJIS.map((e) => (
              <button key={e} onClick={() => setEmoji(e)}
                className="w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-all"
                style={{ background: emoji === e ? V.accentSoft : V.surface, border: `2px solid ${emoji === e ? V.borderActive : "transparent"}` }}>
                {e}
              </button>
            ))}
          </div>

          <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="4-digit PIN (optional, for account recovery)" maxLength={4}
            className="w-full px-4 py-2.5 rounded-xl text-sm mb-4 outline-none text-center"
            style={{ background: V.surface, border: `1px solid ${V.border}`, color: V.text }} />

          <button onClick={handleCreate} disabled={!name.trim() || loading}
            className="btn-press w-full py-3 rounded-xl font-semibold text-sm transition-all mb-3"
            style={{ background: name.trim() ? V.accent : V.surfaceHover, color: name.trim() ? V.inverse : V.faint }}>
            {loading ? "Creating..." : "Let's Go"}
          </button>

          {existingUsers.length > 0 && (
            <button onClick={() => setMode("existing")} className="w-full text-xs py-2" style={{ color: V.faint }}>
              Already have an account? Recover it
            </button>
          )}
        </div>
      ) : (
        <div className="w-full animate-fade-up">
          <input value={recoverName} onChange={(e) => setRecoverName(e.target.value)} placeholder="Your name"
            className="w-full px-4 py-3 rounded-xl text-sm mb-3 outline-none text-center"
            style={{ background: V.surface, border: `1px solid ${V.border}`, color: V.text }} />
          <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="Your 4-digit PIN" maxLength={4}
            className="w-full px-4 py-3 rounded-xl text-sm mb-3 outline-none text-center"
            style={{ background: V.surface, border: `1px solid ${V.border}`, color: V.text }} />
          {error && <p className="text-xs text-center mb-3" style={{ color: "#ef4444" }}>{error}</p>}
          <button onClick={handleRecover} disabled={loading}
            className="btn-press w-full py-3 rounded-xl font-semibold text-sm mb-3"
            style={{ background: V.accent, color: V.inverse }}>
            {loading ? "Recovering..." : "Recover Account"}
          </button>
          <button onClick={() => { setMode("new"); setError(""); }} className="w-full text-xs py-2" style={{ color: V.faint }}>
            Create new account instead
          </button>
        </div>
      )}
    </div>
  );
}

function TaskAddForm({onAdd,onCancel}:{onAdd:(t:TaskTemplate)=>void;onCancel:()=>void}){const[l,sL]=useState("");const[e,sE]=useState("\uD83D\uDCDA");const[d,sD]=useState(15);const[r,sR]=useState(false);return(<div className="p-4 rounded-xl animate-fade-up" style={{background:V.surface,border:`1px solid ${V.borderActive}`}}><p className="text-xs font-medium mb-3" style={{color:V.accent}}>New Session</p><input value={l} onChange={ev=>sL(ev.target.value)} placeholder="Session name" maxLength={30} className="w-full px-3 py-2 rounded-lg text-sm mb-3 outline-none" style={{background:V.surfaceHover,border:`1px solid ${V.border}`,color:V.text}}/><div className="flex gap-1.5 flex-wrap mb-3">{EMOJI_OPTIONS.map(em=>(<button key={em} onClick={()=>sE(em)} className="w-8 h-8 rounded-lg text-base flex items-center justify-center" style={{background:e===em?V.accentSoft:V.surfaceHover,border:`1px solid ${e===em?V.borderActive:"transparent"}`}}>{em}</button>))}</div><div className="flex gap-1.5 flex-wrap mb-3">{DUR_OPTS.map(dur=>(<button key={dur} onClick={()=>sD(dur)} className="px-2.5 py-1 rounded-lg text-xs font-medium" style={{background:d===dur?V.accentSoft:V.surfaceHover,color:d===dur?V.accent:V.muted,border:`1px solid ${d===dur?V.borderActive:"transparent"}`}}>{dur}m</button>))}</div><label className="flex items-center gap-2 mb-3 cursor-pointer"><input type="checkbox" checked={r} onChange={ev=>sR(ev.target.checked)} className="w-3.5 h-3.5 rounded" style={{accentColor:V.accent}}/><span className="text-xs" style={{color:V.muted}}>Can repeat?</span></label><div className="flex gap-2"><button onClick={onCancel} className="btn-press flex-1 py-2 rounded-lg text-xs" style={{border:`1px solid ${V.border}`,color:V.muted}}>Cancel</button><button onClick={()=>{if(!l.trim())return;onAdd({id:`custom-${Date.now()}`,label:l.trim(),emoji:e,duration:d*60,repeatable:r,isCustom:true});}} disabled={!l.trim()} className="btn-press flex-1 py-2 rounded-lg text-xs font-medium" style={{background:l.trim()?V.accent:V.surfaceHover,color:l.trim()?V.inverse:V.faint}}>Add</button></div></div>);}

function TaskEditForm({task,onSave,onCancel}:{task:Task;onSave:(u:Partial<TaskTemplate>)=>void;onCancel:()=>void}){const[l,sL]=useState(task.label);const[e,sE]=useState(task.emoji);const[d,sD]=useState(task.duration/60);const[r,sR]=useState(task.repeatable);return(<div className="p-4 rounded-xl animate-fade-up" style={{background:V.surface,border:`1px solid ${V.borderActive}`}}><p className="text-xs font-medium mb-3" style={{color:V.accent}}>Edit Session</p><input value={l} onChange={ev=>sL(ev.target.value)} maxLength={30} className="w-full px-3 py-2 rounded-lg text-sm mb-3 outline-none" style={{background:V.surfaceHover,border:`1px solid ${V.border}`,color:V.text}}/><div className="flex gap-1.5 flex-wrap mb-3">{EMOJI_OPTIONS.map(em=>(<button key={em} onClick={()=>sE(em)} className="w-8 h-8 rounded-lg text-base flex items-center justify-center" style={{background:e===em?V.accentSoft:V.surfaceHover,border:`1px solid ${e===em?V.borderActive:"transparent"}`}}>{em}</button>))}</div><div className="flex gap-1.5 flex-wrap mb-3">{DUR_OPTS.map(dur=>(<button key={dur} onClick={()=>sD(dur)} className="px-2.5 py-1 rounded-lg text-xs font-medium" style={{background:d===dur?V.accentSoft:V.surfaceHover,color:d===dur?V.accent:V.muted,border:`1px solid ${d===dur?V.borderActive:"transparent"}`}}>{dur}m</button>))}</div><label className="flex items-center gap-2 mb-3 cursor-pointer"><input type="checkbox" checked={r} onChange={ev=>sR(ev.target.checked)} className="w-3.5 h-3.5 rounded" style={{accentColor:V.accent}}/><span className="text-xs" style={{color:V.muted}}>Can repeat?</span></label><div className="flex gap-2"><button onClick={onCancel} className="btn-press flex-1 py-2 rounded-lg text-xs" style={{border:`1px solid ${V.border}`,color:V.muted}}>Cancel</button><button onClick={()=>onSave({label:l.trim(),emoji:e,duration:d*60,repeatable:r})} className="btn-press flex-1 py-2 rounded-lg text-xs font-medium" style={{background:V.accent,color:V.inverse}}>Save</button></div></div>);}

interface BeforeInstallPromptEvent extends Event{prompt():Promise<void>;userChoice:Promise<{outcome:"accepted"|"dismissed"}>;}
