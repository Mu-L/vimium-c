import {
  framesForTab_, get_cOptions, cPort, cRepeat, bgC_, cmdInfo_, set_helpDialogData_, helpDialogData_,
  set_cOptions, set_cPort, cKey, set_cKey, set_cRepeat, curTabId_, OnEdge, runOneMapping_, blank_, set_cEnv
} from "./store"
import * as BgUtils_ from "./utils"
import { Tabs_, runtimeError_, getCurTab, getCurShownTabs_, tabsGet } from "./browser"
import { ensureInnerCSS, ensuredExitAllGrab, indexFrame, showHUD } from "./ports"
import { getI18nJson, trans_ } from "./i18n"
import {
  shortcutRegistry_, normalizedOptions_, availableCommands_,
  makeCommand_
} from "./key_mappings"
import C = kBgCmd

const abs = Math.abs
let _gCmdTimer = 0
let gOnConfirmCallback: ((force1: boolean, arg?: FakeArg) => void) | null | undefined
let _gCmdHasNext: boolean | null
let _cNeedConfirm: BOOL = 1

/** operate command options */

export const replaceCmdOptions = <T extends keyof BgCmdOptions> (known: CmdOptionSafeToClone<T>): void => {
  set_cOptions(BgUtils_.safer_(known))
}

/** skip commands' private ".$xxx" options and ".$count", except those shared public fields */
export const copyCmdOptions = (dest: CommandsNS.RawOptions, src: CommandsNS.Options): CommandsNS.RawOptions => {
  for (const i in src) {
    if (i[0] !== "$" || "$then=$else=$retry=$f=".includes(i + "=") && !i.includes("=")) {
      i in dest || (dest[i] = src[i])
    }
  }
  return dest
}

/** keep all private and public fields in cOptions */
export const overrideCmdOptions = <T extends keyof BgCmdOptions> (known: CmdOptionSafeToClone<T>
    , disconnected?: boolean, oriOptions?: Readonly<KnownOptions<T>> & SafeObject): void => {
  const old = oriOptions || get_cOptions<T, true>()
  BgUtils_.extendIf_(BgUtils_.safer_(known as KnownOptions<T>), old);
  if (!disconnected) {
    (known as any as CommandsNS.Options).$o = old
  }
  oriOptions || set_cOptions(known as KnownOptions<T> as KnownOptions<T> & SafeObject)
}

type StrStartWith$<K extends string> = K extends `$${string}` ? K : never
type BgCmdCanBeOverride = keyof SafeStatefulBgCmdOptions | keyof StatefulBgCmdOptions
type KeyCanBeOverride<T extends BgCmdCanBeOverride> =
    T extends keyof SafeStatefulBgCmdOptions ? SafeStatefulBgCmdOptions[T]
    : T extends keyof StatefulBgCmdOptions
    ? (StatefulBgCmdOptions[T] extends null ? never : StatefulBgCmdOptions[T] & keyof BgCmdOptions[T])
      | Exclude<StrStartWith$<keyof BgCmdOptions[T] & string>, keyof Req.FallbackOptions>
    : never
export const overrideOption = <T extends BgCmdCanBeOverride, K extends KeyCanBeOverride<T> = KeyCanBeOverride<T>>(
    field: K, value: K extends keyof BgCmdOptions[T] ? NonNullable<BgCmdOptions[T][K]> : never,
    curOptions?: KnownOptions<T>): void => {
  curOptions = curOptions || get_cOptions<T, true>() as KnownOptions<T>
  curOptions[field as keyof BgCmdOptions[T]] = value!
  const parentOptions = (curOptions as unknown as CommandsNS.Options).$o
  if (parentOptions != null) { overrideOption(field, value, parentOptions as unknown as KnownOptions<T>) }
}

export const fillOptionWithMask = <Cmd extends keyof BgCmdOptions>(template: string
    , rawMask: MaskOptions["mask"] | UnknownValue, valueKey: (keyof BgCmdOptions[Cmd]) & string | ""
    , stopWords: readonly (Exclude<keyof BgCmdOptions[Cmd], `$${string}` | `o.${string}`>)[]
    ): { ok: 1 | -1, result: string } | { ok: 0, result: number } => {
  let ok: 1 | -1 = -1, toDelete: string | undefined, mask = rawMask
  if (mask === true || mask === "") { mask = template.includes("$s") ? "$s" : "%s" }
  if (mask && typeof mask === "string" && template.includes(mask)) {
    let name = valueKey && (get_cOptions<Cmd>())[valueKey] as string | UnknownValue
    if (!name) {
      const keys = Object.keys(get_cOptions<Cmd>()).filter(i => i[0] !== "$" && !stopWords.includes!(i))
      if (keys.length !== 1 && rawMask !== "") { return { ok: 0, result: keys.length } }
      if (keys.length === 1) {
        name = toDelete = keys[0]
      } else {
        name = ""
      }
    } else {
      toDelete = valueKey
    }
    template = template.replace(mask, (): string => "" + name)
    ok = 1
  }
  if (mask) {
    overrideCmdOptions<C.blank>({})
    get_cOptions<C.runKey, true>().$masked = true
    if (toDelete) {
      delete get_cOptions<C.runKey, true>()[toDelete as keyof BgCmdOptions[C.runKey]]
    }
  }
  return { ok, result: template }
}

/** execute a command normally */

const executeCmdOnTabs = (tabs: Tab[] | [Tab] | undefined): void => {
  const callback = gOnConfirmCallback
  gOnConfirmCallback = null
  if (callback) {
    if (_gCmdHasNext) {
      const { promise_, resolve_ } = BgUtils_.deferPromise_<CmdResult>();
      (callback as unknown as BgCmdCurWndTabs<kBgCmd>)(tabs!, resolve_)
      promise_.then(runNextCmdByResult)
    } else {
      (callback as unknown as BgCmdCurWndTabs<kBgCmd>)(tabs!, blank_)
    }
  }
  set_cEnv(null)
  return tabs ? void 0 : runtimeError_()
}

const onLargeCountConfirmed = (registryEntry: CommandsNS.Item): void => {
  executeCommand(registryEntry, 1, cKey, cPort, cRepeat)
}

export const executeCommand = (registryEntry: CommandsNS.Item, count: number, lastKey: kKeyCode, port: Port | null
    , overriddenCount: number, fallbackCounter?: FgReq[kFgReq.nextKey]["f"] | null): void => {
  setupSingletonCmdTimer(0)
  if (gOnConfirmCallback) {
    gOnConfirmCallback = null // just in case that some callbacks were thrown away
    set_cEnv(null)
    return
  }
  let scale: number | undefined
  let options = normalizedOptions_(registryEntry), repeat = registryEntry.repeat_
  // .count may be invalid, if from other extensions
  if (options && (scale = options.$count)) { count = count * scale || 1 }
  count = overriddenCount
    || (count >= GlobalConsts.CommandCountLimit + 1 ? GlobalConsts.CommandCountLimit
        : count <= -GlobalConsts.CommandCountLimit - 1 ? -GlobalConsts.CommandCountLimit
        : (count | 0) || 1)
  if (count === 1) { /* empty */ }
  else if (repeat === 1) { count = 1 }
  else if (repeat > 0 && (count > repeat || count < -repeat)) {
    if (fallbackCounter != null) {
      count = count < 0 ? -1 : 1
    } else if (!overriddenCount && (!options || options.confirmed !== true)) {
        set_cKey(lastKey)
        set_cOptions(null)
        set_cPort(port!)
        set_cRepeat(count)
        set_cEnv(null)
        void confirm_(registryEntry.command_ as never, abs(count))
        .then((/*#__NOINLINE__*/ onLargeCountConfirmed).bind(null, registryEntry))
        return
    }
  } else { count = count || 1 }
  if (fallbackCounter != null) {
    let maxRetried = fallbackCounter.r! | 0
    maxRetried = Math.max(1, maxRetried >= 0 && maxRetried < 100 ? Math.min(maxRetried || 6, 20) : abs(maxRetried))
    if (fallbackCounter.c && fallbackCounter.c.i >= maxRetried
        && (!options || (options as Req.FallbackOptions).$else !== "showTip")) {
      set_cPort(port!)
      showHUD(`Has run sequential commands for ${maxRetried} times`)
      set_cEnv(null)
      return
    }
    const context = makeFallbackContext(fallbackCounter.c, 1, fallbackCounter.u)
    if (options && (registryEntry.alias_ === kBgCmd.runKey || hasFallbackOptions(options as Req.FallbackOptions)
        || context.t && registryEntry.background_)) {
      const opt2: Req.FallbackOptions = {}
      options ? overrideCmdOptions<kBgCmd.blank>(opt2 as {}, false, options) : BgUtils_.safer_(opt2)
      opt2.$retry = -maxRetried, opt2.$f = context
      context.t && registryEntry.background_ && !(options as Req.FallbackOptions).$else && (opt2.$else = "showTip")
      options = opt2 as typeof opt2 & SafeObject
    }
  }
  if (!registryEntry.background_) {
    const { alias_: fgAlias } = registryEntry,
    wantCSS = (kFgCmd.END <= 32 || fgAlias < 32) && <BOOL> (((
      (1 << kFgCmd.linkHints) | (1 << kFgCmd.marks) | (1 << kFgCmd.passNextKey) | (1 << kFgCmd.focusInput)
    ) >> fgAlias) & 1)
        || fgAlias === kFgCmd.scroll && (!!options && (options as CmdOptions[kFgCmd.scroll]).keepHover === false)
    set_cPort(port!)
    set_cEnv(null)
    port == null || portSendFgCmd(port, fgAlias, wantCSS, options as any, count)
    return
  }
  const { alias_: alias } = registryEntry, func = bgC_[alias]
  _gCmdHasNext = registryEntry.hasNext_
  if (_gCmdHasNext === null) {
    _gCmdHasNext = registryEntry.hasNext_ = options != null && hasFallbackOptions(options as Req.FallbackOptions)
  }
  // safe on renaming
  set_cKey(lastKey)
  set_cOptions(options || ((registryEntry as Writable<typeof registryEntry>).options_ = BgUtils_.safeObj_()))
  set_cPort(port!)
  set_cRepeat(count)
  count = cmdInfo_[alias]
  if (port == null && alias < kBgCmd.MAX_NEED_CPORT + 1 && alias > kBgCmd.MIN_NEED_CPORT - 1) {
    /* empty */
  } else if (count < kCmdInfo.ActiveTab) {
    if (_gCmdHasNext) {
      const { promise_, resolve_ } = BgUtils_.deferPromise_<CmdResult>();
      (func as unknown as BgCmdNoTab<kBgCmd>)(resolve_)
      promise_.then(runNextCmdByResult)
    } else {
      (func as BgCmdNoTab<kBgCmd>)(blank_)
    }
    set_cEnv(null)
  } else {
    _gCmdHasNext = registryEntry.hasNext_
    gOnConfirmCallback = func as BgCmdCurWndTabs<kBgCmd> as any;
    (count < kCmdInfo.CurShownTabsIfRepeat || count === kCmdInfo.CurShownTabsIfRepeat && abs(cRepeat) < 2 ? getCurTab
        : getCurShownTabs_)(/*#__NOINLINE__*/ executeCmdOnTabs)
  }
}

/** show a confirmation dialog */

export const needConfirm_ = () => {
  return _cNeedConfirm && (get_cOptions<C.blank>() as CommandsNS.Options).confirmed !== true
}

/** 0=cancel, 1=force1, count=accept */
export const confirm_ = <T extends kCName> (command: CmdNameIds[T] extends kBgCmd ? T : never
    , askedCount: number): Promise<boolean> => {
  if (!(Build.NDEBUG || !command.includes("."))) {
    console.log("Assert error: command should has no limit on repeats: %c%s", "color:red", command)
  }
  if (!cPort) {
    gOnConfirmCallback = null // clear old commands
    set_cRepeat(cRepeat > 0 ? 1 : -1)
    return Promise.resolve(cRepeat > 0)
  }
  if (!helpDialogData_ || !helpDialogData_[1]) {
    return getI18nJson("help_dialog").then(dict => {
      helpDialogData_ ? helpDialogData_[1] = dict : set_helpDialogData_([null, dict, null])
      return confirm_(command, askedCount)
    })
  }
  let msg = trans_("cmdConfirm", [askedCount, helpDialogData_[1][command] || `### ${command} ###`])
  const { promise_, resolve_ } = BgUtils_.deferPromise_<boolean>()
  const countToReplay = cRepeat, bakOptions = get_cOptions() as any, bakPort = cPort
  setupSingletonCmdTimer(setTimeout(onConfirm, 3000, 0))
  gOnConfirmCallback = (force1: boolean): void => {
    set_cKey(kKeyCode.None)
    set_cOptions(bakOptions)
    set_cPort(bakPort)
    set_cRepeat(force1 ? countToReplay > 0 ? 1 : -1 : countToReplay)
    _cNeedConfirm = 0
    resolve_(force1)
    setTimeout((): void => { _cNeedConfirm = 1 }, 0)
  }
  (framesForTab_.get(cPort.s.tabId_)?.top_ || cPort).postMessage({
    N: kBgReq.count, c: "", i: _gCmdTimer, m: msg
  })
  return promise_
}

const onConfirm = (response: FgReq[kFgReq.cmd]["r"]): void => {
  const callback = gOnConfirmCallback
  gOnConfirmCallback = null
  response > 1 && callback && callback(response < 3)
}

const setupSingletonCmdTimer = (newTimer: number): void => {
  _gCmdTimer && clearTimeout(_gCmdTimer)
  _gCmdTimer = newTimer
}

export const onConfirmResponse = (request: FgReq[kFgReq.cmd], port: Port): void => {
  const cmd = request.c as StandardShortcutNames, id = request.i
  if (id >= -1 && _gCmdTimer !== id) { return } // an old / aborted / test message
  setupSingletonCmdTimer(0)
  if (request.r) {
    onConfirm(request.r)
    return
  }
  executeCommand(shortcutRegistry_!.get(cmd)!, request.n, kKeyCode.None, port, 0)
}

/** forward a triggered command */

export const sendFgCmd = <K extends keyof CmdOptions> (cmd: K, css: boolean, opts: CmdOptions[K]): void => {
  portSendFgCmd(cPort, cmd, css, opts, 1)
}

export const portSendFgCmd = <K extends keyof CmdOptions> (
    port: Port, cmd: K, css: boolean | BOOL, opts: CmdOptions[K], count: number): void => {
  port.postMessage<1, K>({ N: kBgReq.execute, H: css ? ensureInnerCSS(port.s) : null, c: cmd, n: count, a: opts })
}

export const executeShortcut = (shortcutName: StandardShortcutNames, ref: Frames.Frames | null | undefined): void => {
  setupSingletonCmdTimer(0)
  if (ref) {
    let port = ref.cur_
    setupSingletonCmdTimer(setTimeout(executeShortcut, 100, shortcutName, null))
    port.postMessage({ N: kBgReq.count, c: shortcutName, i: _gCmdTimer, m: "" })
    ensuredExitAllGrab(ref)
    return
  }
  const registry = shortcutRegistry_!.get(shortcutName)!, cmdName = registry.command_
  let realAlias: keyof BgCmdOptions = 0, realRegistry = registry
  if (cmdName === "goBack" || cmdName === "goForward") {
    if (!OnEdge && Tabs_.goBack) {
      realAlias = kBgCmd.goBackFallback
    }
  } else if (cmdName === "autoOpen") {
    realAlias = kBgCmd.autoOpenFallback
  }
  const opts = normalizedOptions_(registry)
  if (realAlias) {
    /** this object shape should keep the same as the one in {@link key_mappings.ts#makeCommand_} */
    realRegistry = As_<CommandsNS.Item & CommandsNS.NormalizedItem>({
      alias_: realAlias, background_: 1, command_: cmdName, help_: null,
      options_: opts, hasNext_: null, repeat_: registry.repeat_
    })
  } else if (!registry.background_) {
    return
  } else {
    realAlias = registry.alias_
  }
  if (realAlias > kBgCmd.MAX_NEED_CPORT || realAlias < kBgCmd.MIN_NEED_CPORT) {
    executeCommand(realRegistry, 1, kKeyCode.None, null as never as Port, 0)
  } else if (!opts || !opts.$noWarn) {
    ((opts || ((registry as Writable<typeof registry>).options_ = BgUtils_.safeObj_<any>())
      ) as CommandsNS.SharedInnerOptions).$noWarn = true
      console.log("Error: Command", cmdName, "must run on pages which have run Vimium C")
  }
}

/** this functions needs to accept any types of arguments and normalize them */
export const executeExternalCmd = (
    message: Partial<ExternalMsgs[kFgReq.command]["req"]>, sender: chrome.runtime.MessageSender): void => {
  let command = message.command;
  command = command ? command + "" : "";
  const description = command ? availableCommands_[command] : null
  if (!description) { return; }
  let ref: Frames.Frames | undefined
  const port: Port | null = sender.tab ? indexFrame(sender.tab.id, sender.frameId || 0)
      || (ref = framesForTab_.get(sender.tab.id), ref ? ref.cur_ : null) : null
  if (!port && !description[1]) { /** {@link index.d.ts#CommandsNS.FgDescription} */
    return;
  }
  let options = (message.options || null) as CommandsNS.RawOptions | null
    , lastKey: kKeyCode | undefined = message.key
    , regItem = makeCommand_(command, options)
    , count = message.count as number | string | undefined;
  if (!regItem) { return; }
  count = count !== "-" ? parseInt(count as string, 10) || 1 : -1;
  options && typeof options === "object" ?
      BgUtils_.safer_(options) : (options = null);
  lastKey = 0 | lastKey!;
  executeCommand(regItem, count, lastKey, port, 0)
}

/** execute a command referred by .$then or .$else */

export const hasFallbackOptions = (options: Req.FallbackOptions): boolean => !!(options.$then || options.$else)

export const parseFallbackOptions = (options: Req.FallbackOptions): Req.FallbackOptions | null => {
  const thenKey = options.$then, elseKey = options.$else
  return thenKey || elseKey ? {
    $then: thenKey, $else: elseKey, $retry: options.$retry, $f: options.$f
  } : null
}

export const wrapFallbackOptions = <T extends KeysWithFallback<CmdOptions>, S extends KeysWithFallback<BgCmdOptions>> (
    options_mutable: CmdOptionSafeToClone<T>): CmdOptions[T] => {
  const fallback = parseFallbackOptions(get_cOptions<S, true>() as Partial<BgCmdOptions[S]>)
  fallback && Object.assign(options_mutable as unknown as CmdOptions[T], fallback)
  return options_mutable as unknown as CmdOptions[T]
}

const makeFallbackContext = (old: Req.FallbackOptions["$f"], counterStep: number, newTip: kTip | 0 | false
    ): NonNullable<Req.FallbackOptions["$f"]> => {
  return {
    i: (old ? old.i : 0) + counterStep,
    t: newTip && newTip !== 2 ? newTip : old ? old.t : 0
  }
}

export const runNextCmd = <T extends KeysWithFallback<BgCmdOptions> = never> (
    useThen: T extends kBgCmd ? BOOL : "need kBgCmd"): boolean => {
  return runNextCmdBy(useThen, get_cOptions<T, true>() as Req.FallbackOptions)
}

export declare const enum kRunOn { otherCb = 0, tabCb = 1, otherPromise = 2, tabPromise = 3 }

export const getRunNextCmdBy = <T extends kRunOn> (isResultTab: T
    ): (result?: T extends kRunOn.tabCb | kRunOn.tabPromise ? Tab : unknown) => void =>
  hasFallbackOptions(get_cOptions<C.blank, true>()) ? (result?: unknown): void => {
    const err = isResultTab & 2 ? result === undefined : runtimeError_(), options = get_cOptions<C.blank, true>()
    err ? runNextCmdBy(0, options) : runNextOnTabLoaded(options, isResultTab & 1 ? result as Tab : null)
    return isResultTab & 2 ? undefined : err
  } : isResultTab & 2 ? blank_ : runtimeError_

const runNextCmdByResult = (result: CmdResult): void => {
  typeof result === "object" ? runNextOnTabLoaded(get_cOptions<C.blank, true>(), result)
  : typeof result === "boolean" ? runNextCmdBy(result ? 1 : 0, get_cOptions<C.blank, true>(), null)
  : As_<0 | 1 | -1 | 50>(result) < 0 ? void 0
  : runNextCmdBy(result ? 1 : 0, get_cOptions<C.blank, true>(), result > 1 ? result : null)
}

export const runNextCmdBy = (useThen: BOOL, options: Req.FallbackOptions, timeout?: number | null): boolean => {
  const nextKey = useThen ? options.$then : options.$else
  const hasFallback = !!nextKey && typeof nextKey === "string"
  if (hasFallback) {
    const fStatus: NonNullable<FgReq[kFgReq.nextKey]["f"]> = { c: options.$f, r: options.$retry, u: 0, w: 0 }
    setupSingletonCmdTimer(setTimeout((): void => {
      const frames = framesForTab_.get(curTabId_),
      port = cPort && cPort.s.tabId_ === curTabId_ && frames && frames.ports_.indexOf(cPort) > 0 ? cPort
          : !frames ? null : frames.cur_.s.status_ === Frames.Status.disabled
          && frames.ports_.filter(i => i.s.status_ !== Frames.Status.disabled)
              .sort((a, b) => a.s.frameId_ - b.s.frameId_)[0] || frames.cur_
      frames && ensuredExitAllGrab(frames)
      runOneMapping_(nextKey, port, fStatus)
    }, timeout || 50))
  }
  return hasFallback
}

export const runNextOnTabLoaded = (options: OpenUrlOptions | Req.FallbackOptions | CommandsNS.Options
    , targetTab: Tab | null | undefined | /* in cur without wait */ false, callback?: () => void): void => {
  const nextKey = (options as Req.FallbackOptions).$then
  if ((!nextKey || typeof nextKey !== "string") && !callback) {
    return
  }
  const onTimer = (tab1?: Tab): void => {
    const now = Date.now(), isTimedOut = now < start - 500 || now - start >= timeout
    // not clear the _gCmdTimer, in case a (new) tab closes itself and opens another tab
    if (!tab1 || !_gCmdTimer) { tabId = GlobalConsts.TabIdNone; return runtimeError_() }
    if (isTimedOut || tab1.status === "complete") {
      // not check injection status - let the command of `wait for="ready"` check it
      // so some commands not using cPort can run earlier
      if (callback && !isTimedOut && !framesForTab_.has(tab1.id)) {
        return
      }
      setupSingletonCmdTimer(0)
      gOnConfirmCallback = null
      callback && callback()
      nextKey && runNextCmdBy(1, options as {}, callback ? 67 : 0)
    }
  }
  const timeout = targetTab !== false ? 1500 : 500
  let tabId = targetTab ? targetTab.id : targetTab !== false ? GlobalConsts.TabIdNone : curTabId_,
  start = Date.now()
  setupSingletonCmdTimer(setInterval((): void => {
    tabsGet(tabId !== GlobalConsts.TabIdNone ? tabId : curTabId_, onTimer)
  }, 100)) // it's safe to clear an interval using `clearTimeout`
}

export const waitAndRunKeyReq = (request: FgReq[kFgReq.nextKey], port: Port | null): void => {
  const fallbackInfo = request.f
  const options: Req.FallbackOptions = { $then: request.k, $else: null, $retry: fallbackInfo.r,
        $f: makeFallbackContext(fallbackInfo.c, 0, fallbackInfo.u) }
  set_cPort(port!)
  if (fallbackInfo.u === false) {
    runNextOnTabLoaded(options, null)
  } else {
    runNextCmdBy(1, options, fallbackInfo.w)
  }
}
