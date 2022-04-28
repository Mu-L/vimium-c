import {
  OnChrome, OnFirefox, OnEdge, doc, deref_, weakRef_ff, chromeVer_, isJSUrl, getTime, parseOpenPageUrlOptions, safeCall,
  tryCreateRegExp, weakRef_not_ff, firefoxVer_, fgCache, max_
} from "../lib/utils"
import {
  IsInDOM_, isInTouchMode_cr_, MDW, hasTag_, CLK, attr_s, contains_s, focus_, fullscreenEl_unsafe_, findAnchor_,
  deepActiveEl_unsafe_, blur_unsafe, derefInDoc_
} from "../lib/dom_utils"
import { suppressTail_ } from "../lib/keyboard_utils"
import { Point2D, center_, getVisibleClientRect_, view_ } from "../lib/rect"
import { insert_Lock_ } from "./insert"
import { post_ } from "./port"
import { flash_, moveSel_s_throwable } from "./dom_ui"
import { coreHints, hintApi, hintManager, mode1_ as hintMode1_, hintOptions, isHintsActive } from "./link_hints"
import { prepareToBlockClick, clickEventToPrevent_, dispatchAndBlockClickOnce } from "./extend_click_ff"
import { currentScrolling, setNewScrolling, set_cachedScrollable } from "./scroller"
/* eslint-disable @typescript-eslint/await-thenable */

export declare const enum kClickAction {
  none = 0,
  plainMayOpenManually = 1, plainInNewTab = 2, plainInNewWindow = 3, MaxPlain = 3,
  forceToOpenInLastWnd = 4, forceInNewTab = 5, forceToOpenInCurrent = 6,
  // the [1..BaseMayInteract) before this line should always mean HTML <a>
  BaseMayInteract = 8, FlagDblClick = 1, FlagInteract = 2, MinNeverInteract = 12,
}
const enum ActionType {
  OnlyDispatch = 0,
  dblClick = kClickAction.FlagDblClick, interact = kClickAction.FlagInteract,
  MinOpenUrl = kClickAction.MinNeverInteract - kClickAction.BaseMayInteract,
  DispatchAndMayOpenTab = MinOpenUrl, OpenTabButNotDispatch,
}
export declare const enum kClickButton { none = 0, primary = 1, second = 2, primaryAndTwice = 4 }
type AcceptableClickButtons = kClickButton.none | kClickButton.second | kClickButton.primaryAndTwice
type MyMouseControlKeys = [ altKey: boolean, ctrlKey: boolean, metaKey: boolean, shiftKey: boolean ]

type kMouseMoveEvents = "mouseover" | "mouseenter" | "mousemove" | "mouseout" | "mouseleave"
type kMouseClickEvents = "mousedown" | "mouseup" | "click" | "auxclick" | "dblclick" | "contextmenu"
type NullableSafeElForM = SafeElementForMouse | null | undefined

interface YieldedValue { 42: true }
interface YieldedPos { label_: number; sent_ (): YieldedValue | undefined }
type YieldableFunction = (pos: YieldedPos) => [/** step */ number, /** returned */ YieldedValue?]

let evIDC_cr: InputDeviceCapabilities | undefined
let lastHovered_: WeakRef<SafeElementForMouse> | null | undefined

export { lastHovered_, evIDC_cr }
export function set_lastHovered_ (_newHovered: WeakRef<SafeElementForMouse> | null): void { lastHovered_ = _newHovered }
export function set_evIDC_cr (_newIDC: InputDeviceCapabilities | undefined): void { evIDC_cr = _newIDC }

/** util functions */

const __generator = Build.BTypes & BrowserType.Chrome && Build.MinCVer < BrowserVer.MinEnsuredGeneratorFunction
    ? (_0: void | undefined, branchedFunc: YieldableFunction): YieldableFunction => branchedFunc : 0 as never

const __myAwaiter = Build.BTypes & BrowserType.Chrome ? Build.MinCVer < BrowserVer.MinEnsuredGeneratorFunction
? (branchedFunc: () => YieldableFunction): Promise<any> => new Promise<any> ((resolve): void => {
  const resolveVoid = resolve.bind(0, void 0)
  const generator = branchedFunc()
  let value_: YieldedValue | undefined, async_pos_: YieldedPos = { label_: 0, sent_: () => value_ }
  resume_()
  function resume_(newValue?: YieldedValue): void {
    value_ = newValue
    let nextInst = Instruction.next
    while (~nextInst & Instruction.return) {
      let tmp = generator(async_pos_)
      nextInst = tmp[0], value_ = tmp.length > 1 ? tmp[1] : void 0
      if (Build.NDEBUG ? nextInst > Instruction.yield - 1 : nextInst === Instruction.yield) {
        async_pos_.label_++; nextInst = Instruction.yield | Instruction.return
      } else if (Build.NDEBUG ? nextInst > Instruction.break - 1 : nextInst === Instruction.break) {
        async_pos_.label_ = value_ as unknown as number
      } else if (!(Build.NDEBUG || nextInst === Instruction.next || nextInst === Instruction.return)) {
        throw Error("Assert error: unsupported async status: " + nextInst)
      }
    }
    Promise.resolve(value_).then(nextInst < Instruction.return + 1 ? resolve : resume_
        , Build.NDEBUG ? resolveVoid : logDebugAndResolve)
  }
  function logDebugAndResolve(err: any): void {
    console.log("Vimium C: an async function fails:", err)
    resolveVoid()
  }
})
: Build.MinCVer < BrowserVer.MinEnsuredES2017AsyncFunctions
? <TNext, TReturn> (generatorFunction: () => Generator<TNext | TReturn | Promise<TNext | TReturn>, TReturn, TNext>
    ): Promise<TReturn | void> => new Promise<TReturn | void> ((resolve): void => {
  const resolveVoid = Build.MinCVer < BrowserVer.MinTestedES6Environment ? resolve.bind(0, void 0) : () => resolve()
  const generator = generatorFunction()
  const resume_ = (lastVal?: TNext): void => {
    const yielded = generator.next(lastVal), value = yielded.value
    if (Build.MinCVer < BrowserVer.Min$resolve$Promise$MeansThen) {
      Promise.resolve(value).then((yielded.done ? resolve : resume_) as (value: TReturn | TNext) => void
          , Build.NDEBUG ? resolveVoid : logDebugAndResolve)
    } else if (yielded.done) {
      resolve(value as TReturn | Promise<TReturn> as /** just to satisfy type checks */ TReturn)
    } else {
      Promise.resolve(value as TNext | Promise<TNext>).then(resume_, Build.NDEBUG ? resolveVoid : logDebugAndResolve)
    }
  }
  resume_()
  function logDebugAndResolve(err: any): void {
    if (!Build.NDEBUG) { console.log("Vimium C: an async function fails:", err) }
    resolveVoid()
  }
})
: 0 as never : 0 as never

const __awaiter = Build.BTypes & BrowserType.Chrome && Build.MinCVer < BrowserVer.MinEnsuredES2017AsyncFunctions
? (_aw_self: void | 0 | undefined, _aw_args: unknown, _aw_p: PromiseConstructor | 0 | undefined
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    , func_to_await: Function): Promise<YieldedValue> => __myAwaiter(func_to_await as any)
: 0 as never

export { __generator as __asyncGenerator, __awaiter as __asyncAwaiter }

export const catchAsyncErrorSilently = <T> (__pFromAsync: Promise<T>): Promise<T | void> =>
    Build.NDEBUG ? __pFromAsync : OnChrome && Build.MinCVer < BrowserVer.MinEnsuredES2017AsyncFunctions ? __pFromAsync
    : __pFromAsync.catch(e => { console.log("Vimium C: unexpected error\n", e) })

/** sync dispatchers */

const mouse_ = function (element: SafeElementForMouse
    , type: kMouseClickEvents | kMouseMoveEvents
    , center: Point2D, modifiers?: MyMouseControlKeys | null, relatedTarget?: NullableSafeElForM
    , button?: AcceptableClickButtons): boolean {
  const doc1 = element.ownerDocument as Document, view = doc1.defaultView || window,
  tyKey = type.slice(5, 6),
  // is: down | up | (click) | dblclick | auxclick
  detail = !"dui".includes(tyKey) ? 0 : button! & kClickButton.primaryAndTwice ? 2 : 1,
  bubbles = tyKey !== "e" && tyKey !== "l", // not (enter | leave)
  x = center[0], y = center[1],
  altKey = modifiers ? modifiers[0] : !1, ctrlKey = modifiers ? modifiers[1] : !1,
  metaKey = modifiers ? modifiers[2] : !1, shiftKey = modifiers ? modifiers[3] : !1
  button = (button! & kClickButton.second) as kClickButton.none | kClickButton.second
  relatedTarget = relatedTarget && relatedTarget.ownerDocument === doc1 ? relatedTarget : null
  let mouseEvent: MouseEvent
  // note: there seems no way to get correct screenX/Y of an element
  if (!OnChrome
      || Build.MinCVer >= BrowserVer.MinUsable$MouseEvent$$constructor
      || chromeVer_ >= BrowserVer.MinUsable$MouseEvent$$constructor) {
    // Note: The `composed` here may require Shadow DOM support
    const init: ValidMouseEventInit = {
      bubbles, cancelable: bubbles, composed: !0, view, detail,
      screenX: x, screenY: y, clientX: x, clientY: y, ctrlKey, altKey, shiftKey, metaKey,
      button, buttons: tyKey === "d" ? button || 1 : 0,
      relatedTarget
    }
    OnChrome && setupIDC_cr!(init)
    mouseEvent = new MouseEvent(type, init)
  } else {
    mouseEvent = doc1.createEvent("MouseEvents")
    mouseEvent.initMouseEvent(type, bubbles, bubbles, view, detail, x, y, x, y
      , ctrlKey, altKey, shiftKey, metaKey, button, relatedTarget)
  }
  if (OnFirefox && clickEventToPrevent_) { // must be a click event
    return dispatchAndBlockClickOnce(element, mouseEvent)
  }
  return element.dispatchEvent(mouseEvent)
} as {
  (element: SafeElementForMouse, type: kMouseClickEvents
    , center: Point2D
    , modifiers?: MyMouseControlKeys | null, related?: NullableSafeElForM
    , button?: AcceptableClickButtons): boolean
  (element: SafeElementForMouse, type: kMouseMoveEvents, center: Point2D
    , modifiers?: null, related?: NullableSafeElForM): boolean
}

export const setupIDC_cr = OnChrome ? (init: UIEventInit): void => {
  const IDC = Build.MinCVer < BrowserVer.MinEnsured$InputDeviceCapabilities ? InputDeviceCapabilities : null
  if (Build.MinCVer >= BrowserVer.MinEnsured$InputDeviceCapabilities || IDC) {
    init.sourceCapabilities = evIDC_cr = evIDC_cr || new (Build.MinCVer < BrowserVer.MinEnsured$InputDeviceCapabilities
        ? IDC : InputDeviceCapabilities)!({fireTouchEvents: !1})
  }
} : 0 as never as null

export const touch_cr_ = OnChrome ? (element: SafeElementForMouse
    , [x, y]: Point2D, id?: number): number => {
  const newId = id || getTime(),
  touchObj = new Touch({
    identifier: newId, target: element,
    clientX: x, clientY: y,
    screenX: x, screenY: y,
    pageX: x + scrollX, pageY: y + scrollY,
    radiusX: 8, radiusY: 8, force: 1
  }), touches = id ? [] : [touchObj],
  touchEvent = new TouchEvent(id ? "touchend" : "touchstart", {
    cancelable: !0, bubbles: !0,
    touches, targetTouches: touches,
    changedTouches: [touchObj]
  })
  element.dispatchEvent(touchEvent)
  return newId
} : 0 as never as null

/** async dispatchers */

/** note: will NOT skip even if newEl == @lastHovered */
export const hover_async = (async (newEl?: NullableSafeElForM
    , center?: Point2D, doesFocus?: boolean): Promise<void> => {
  // if center is affected by zoom / transform, then still dispatch mousemove
  let elFromPoint = center && doc.elementFromPoint(center[0], center[1]),
  canDispatchMove: boolean = !newEl || elFromPoint === newEl || !elFromPoint || !contains_s(newEl, elFromPoint),
  last = derefInDoc_(lastHovered_), N = lastHovered_ = null
  const notSame = newEl !== last
  if (last) {
    // MS Edge 90 dispatches mouseout and mouseleave if only a target element is in doc
    await mouse_(last, "mouseout", [0, 0], N, notSame ? newEl : N)
    if ((!newEl || notSame && !IsInDOM_(newEl, last, 1)) && IsInDOM_(last, doc)) {
      mouse_(last, "mouseleave", [0, 0], N, newEl)
      if (doesFocus && IsInDOM_(await last)) { // always blur even when moved to another document
        blur_unsafe(last)
      }
    }
    last = notSame ? last : N
    await 0 // should keep function effects stable - not related to what `newEl` is
  } else {
    last = N
  }
  if (newEl && IsInDOM_(newEl)) {
    // then center is not null
    await mouse_(newEl, "mouseover", center!, N, last)
    if (IsInDOM_(newEl)) {
      await mouse_(newEl, "mouseenter", center!, N, last)
      if (canDispatchMove && IsInDOM_(newEl)) {
        mouse_(newEl, "mousemove", center!)
      }
      lastHovered_ = IsInDOM_(newEl) ? OnFirefox ? weakRef_ff(newEl, kElRef.lastHovered) : weakRef_not_ff!(newEl) : N
      notSame && doesFocus && lastHovered_ && focus_(newEl)
    }
  }
  // here always ensure lastHovered_ is "in DOM" or null
}) as {
  (newEl: SafeElementForMouse, center: Point2D, focus?: boolean): Promise<void>
  (newEl?: null): Promise<void>
}

export const unhover_async = (!OnChrome || Build.MinCVer >= BrowserVer.MinEnsuredGeneratorFunction
? async (element?: NullableSafeElForM): Promise<void> => {
  const old = derefInDoc_(lastHovered_), active = element || old
  if (old !== element) {
    await hover_async()
  }
  lastHovered_ = OnFirefox ? weakRef_ff(element, kElRef.lastHovered) : weakRef_not_ff!(element)
  await hover_async()
  blur_unsafe(active)
}
: (el?: NullableSafeElForM, step?: 1 | 2, old?: NullableSafeElForM): Promise<void | false> | void | false => {
  if (!step) {
    old = derefInDoc_(lastHovered_)
    return Promise.resolve<void | false>(old !== el && hover_async()).then(unhover_async
        .bind<void, NullableSafeElForM, 1, NullableSafeElForM, [], Promise<void | false>>(0, el, 1, el || old))
  } else if (step < 2) {
    lastHovered_ = OnFirefox ? weakRef_ff(el, kElRef.lastHovered) : weakRef_not_ff!(el)
    return hover_async().then(unhover_async.bind<0, NullableSafeElForM, 2, [], void | false>(0, old, 2))
  } else {
    return blur_unsafe(el)
  }
}) as {
  (element?: NullableSafeElForM, step?: undefined, active?: undefined): Promise<void | false>
  (element: NullableSafeElForM, step: 1, active: NullableSafeElForM): Promise<void | false>
  (element: NullableSafeElForM, step: 2): /* all false values */ void | false
}


export const click_async = (async (element: SafeElementForMouse
    , rect?: Rect | null, addFocus?: boolean | BOOL, modifiers?: MyMouseControlKeys
    , action?: kClickAction, button?: AcceptableClickButtons
    , /** default: false */ touchMode?: null | false | /** false */ 0 | true | "auto"): Promise<void | 1> => {
  /**
   * for important events including `mousedown`, `mouseup`, `click` and `dblclick`, wait for two micro tasks;
   * for other events, just wait for one micro task
   */
  if (OnEdge) {
    if ((element as Partial<HTMLInputElement /* |HTMLSelectElement|HTMLButtonElement */>).disabled) {
      return
    }
  }
  const kMenu = "contextmenu"
  const userOptions = isHintsActive && !((hintManager || coreHints).$().k.c as any[] | undefined) ? hintOptions : null
  const xy = userOptions && userOptions.xy as HintsNS.StdXY | undefined
      || button === kClickButton.second && userOptions![kMenu] !== !1 && { x: 20, y: -4 } as HintsNS.StdXY || null
  const center = center_(rect || (rect = getVisibleClientRect_(element)), xy)
  const sedIf = userOptions && userOptions.sedIf
  let result: ActionType = max_((action = action! | 0) - kClickAction.BaseMayInteract, 0)
  if (OnChrome
      && (Build.MinCVer >= BrowserVer.MinEnsuredTouchEventConstructor
          || chromeVer_ >= BrowserVer.MinEnsuredTouchEventConstructor)
      && (touchMode === !0 || touchMode && isInTouchMode_cr_!())) {
    let id = await touch_cr_!(element, center)
    if (IsInDOM_(element)) {
      await touch_cr_!(element, center, id)
    }
    if (!IsInDOM_(element)) { return }
  }
  if (element !== deref_(lastHovered_)) {
    await hover_async(element, center)
    if (!lastHovered_) { return }
  }
  if (OnFirefox) {
    // https://bugzilla.mozilla.org/show_bug.cgi?id=329509 says this starts on FF65,
    // but tests also confirmed it on Firefox 63.0.3 x64, Win10
    if ((element as Partial<HTMLInputElement /* |HTMLSelectElement|HTMLButtonElement */>).disabled) {
      return
    }
  }
  const mousedownNotPrevented = await mouse_(element, MDW, center, modifiers, null, button)
  await 0
  if (!IsInDOM_(element)) { return }
  // Note: here we can check doc.activeEl only when @click is used on the current focused document
  if (addFocus && mousedownNotPrevented && element !== insert_Lock_() && element !== deepActiveEl_unsafe_() &&
      !(element as Partial<HTMLInputElement>).disabled) {
    focus_(element)
    if (!IsInDOM_(element)) { return }
    await 0
  }
  await mouse_(element, "mouseup", center, modifiers, null, button)
  await 0
  if (!IsInDOM_(element)) { return }
  if (button === kClickButton.second) {
    // if button is the right, then auxclick can be triggered even if element.disabled
    mouse_(element, "auxclick", center, modifiers, null, button)
    mouse_(element, kMenu, center, modifiers, null, button)
    return
  }
  if (OnChrome && (element as Partial<HTMLInputElement /* |HTMLSelectElement|HTMLButtonElement */>).disabled) {
    return
  }
  let url: string | null
  let parentAnchor: HTMLAnchorElement & SafeHTMLElement | null, sedIfRe: RegExpOne | void
  if (!result && (action || sedIf) && (parentAnchor = findAnchor_(element))
      && (url = attr_s(parentAnchor as SafeElement, "href"))
      && !(OnFirefox && parentAnchor.href.startsWith("file:") || url[0] === "#")) {
    // for forceToDblclick, element can be OtherSafeElement; for [1..BaseMayInteract), element must be in <html:a>
    result = sedIf && (sedIfRe = tryCreateRegExp(sedIf)) && sedIfRe.test(parentAnchor.href)
          ? ActionType.OpenTabButNotDispatch
        : isJSUrl(url) || (OnFirefox ? !action : action < kClickAction.MaxPlain + 1) ? ActionType.OnlyDispatch
        : !OnFirefox || action > kClickAction.MaxPlain ? ActionType.OpenTabButNotDispatch
        : (Build.MinFFVer < FirefoxBrowserVer.MinPopupBlockerPassComposedClicksFromExtensions
              && firefoxVer_ < FirefoxBrowserVer.MinPopupBlockerPassComposedClicksFromExtensions
              && (Build.MinFFVer > FirefoxBrowserVer.ESRPopupBlockerPassClicksFromExtensions
                  || firefoxVer_ - FirefoxBrowserVer.ESRPopupBlockerPassClicksFromExtensions || fgCache.V < 6)
              || action <= kClickAction.plainMayOpenManually)
          && (action > kClickAction.plainMayOpenManually || parentAnchor.target === "_blank")
        ? ActionType.DispatchAndMayOpenTab : ActionType.OnlyDispatch
  }
  const isCommonClick = result < ActionType.OpenTabButNotDispatch && button !== kClickButton.primaryAndTwice
      && !(modifiers && modifiers[0])
  isCommonClick && setNewScrolling(element) // DOMActivate is not triggered if a click event is cancelled (prevented)
  if ((result > ActionType.OpenTabButNotDispatch - 1
        || (OnFirefox && /*#__INLINE__*/ prepareToBlockClick(result === ActionType.DispatchAndMayOpenTab
                , action < kClickAction.plainMayOpenManually + 1 && parentAnchor!),
            (await await mouse_(element, CLK, center, modifiers)) && result || result === ActionType.dblClick))
      && getVisibleClientRect_(element)) {
    // require element is still visible
    isCommonClick && set_cachedScrollable(currentScrolling)
    if (result < ActionType.MinOpenUrl) {
      if (result & ActionType.dblClick
          && !(element as Partial<HTMLInputElement /* |HTMLSelectElement|HTMLButtonElement */>).disabled
          && (// use old rect
            await click_async(element, rect, 0, modifiers, kClickAction.none, kClickButton.primaryAndTwice),
            !getVisibleClientRect_(element)
            || !await await mouse_(element, "dblclick", center, modifiers, null, kClickButton.primaryAndTwice)
            || !getVisibleClientRect_(element)
          )) {
        /* empty */
      } else if (result & ActionType.interact) {
        if (result & ActionType.dblClick) {
          if (hasTag_("video", element)) {
            if ((!OnChrome ? !OnFirefox || element.requestFullscreen
                  : Build.MinCVer >= BrowserVer.MinEnsured$Document$$fullscreenElement
                    || chromeVer_ > BrowserVer.MinEnsured$Document$$fullscreenElement - 1)) {
              fullscreenEl_unsafe_() ? doc.exitFullscreen() : element.requestFullscreen()
            } else {
              fullscreenEl_unsafe_()
              ? OnFirefox ? doc.mozCancelFullScreen() : doc.webkitExitFullscreen()
              : OnFirefox ? element.mozRequestFullScreen() : element.webkitRequestFullscreen()
            }
          }
        } else {
          (element as HTMLMediaElement).paused ? (element as HTMLMediaElement).play()
          : (element as HTMLMediaElement).pause()
        }
      }
      return
    }
    // use latest attributes ; now result > 0, so hintOptions and specialAction exists
    /** ignore {@link #BrowserVer.Min$TargetIsBlank$Implies$Noopener}, since C91 and FF88 always set openerTabId */
    const reuse = action === kClickAction.plainInNewWindow ? ReuseType.newWnd
        : action > kClickAction.forceToOpenInCurrent - 1 || !action ? ReuseType.current
        : (action === kClickAction.forceToOpenInLastWnd ? ReuseType.OFFSET_LAST_WINDOW : 0)
          + ((hintMode1_ & HintMode.newtab_n_active) - HintMode.newTab ? ReuseType.newFg : ReuseType.newBg);
    (hintApi ? hintApi.p : post_)({
      H: kFgReq.openUrl, u: parentAnchor!.href, f: !0,
      r: reuse, o: userOptions && parseOpenPageUrlOptions(userOptions)
    })
    return 1
  }
}) as {
  (element: SafeElementForMouse
    , rect: Rect | null | undefined, addFocus: boolean | BOOL, modifiers: MyMouseControlKeys
    , specialAction: kClickAction, button: AcceptableClickButtons
    , /** default: false */ touchMode: null | undefined | false | /** false */ 0 | true | "auto"): Promise<void | 1>
  (element: SafeElementForMouse
    , rect: Rect | null, addFocus: boolean | BOOL, modifiers: MyMouseControlKeys | undefined
    , specialAction: kClickAction.none, button: kClickButton.primaryAndTwice): Promise<void | 1>
  (element: SafeElementForMouse
    , rect?: Rect | null, addFocus?: boolean | BOOL, useAltKey?: [true, false, false, false]): Promise<void | 1>
}

export const select_ = (element: LockableElement, rect?: Rect | null, show_flash?: boolean
    , action?: SelectActions, suppressRepeated?: boolean): Promise<void> => {
  const y = scrollY
  return catchAsyncErrorSilently(click_async(element, rect, 1)).then((): void => {
    view_(element, y)
    // re-compute rect of element, in case that an input is resized when focused
    show_flash && flash_(element)
    if (element !== insert_Lock_()) { return }
    // then `element` is always safe
    if (Build.NDEBUG) {
      safeCall(/*#__INLINE__*/ moveSel_s_throwable, element, action)
    } else {
      try {
        moveSel_s_throwable(element, action)
      } catch (e) {
        console.log("Vimium C: failed in moving caret.", e)
      }
    }
    if (suppressRepeated) { suppressTail_() }
  })
}

if (Build.BTypes & BrowserType.Chrome && Build.MinCVer < BrowserVer.MinEnsuredGeneratorFunction) {
  if (!(Build.NDEBUG || (<RegExpOne> /\.label_\b/).test(click_async + ""))) {
    alert("Assert error: async functions should have used `label_` and `sent_`")
  }
}
