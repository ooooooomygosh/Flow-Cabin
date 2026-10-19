// Listen-only global input counter for macOS.
//
// This deliberately learns one structural lesson from BongoCat: a HID-level,
// head-inserted, listen-only event tap is much more reliable than a session tap
// that can inspect or modify events. The callback does one fixed classification
// and increments a counter; JavaScript drains those counters later. No keycode,
// character, button, coordinate, application name or window title leaves this
// file.

#include <node_api.h>

#import <ApplicationServices/ApplicationServices.h>

#include <atomic>
#include <cstdint>
#include <mutex>
#include <thread>

namespace {

std::atomic<uint64_t> keyboardCount{0};
std::atomic<uint64_t> clickCount{0};
std::atomic<uint64_t> disabledCount{0};
std::atomic<uint64_t> modifierState{0};
std::atomic<bool> running{false};
std::atomic<bool> stopRequested{false};
std::atomic<CFRunLoopRef> runLoop{nullptr};

std::mutex lifecycleMutex;
std::thread worker;
CFMachPortRef eventTap = nullptr;
CFRunLoopSourceRef eventSource = nullptr;

constexpr CGEventMask kEventMask =
    (1ULL << kCGEventKeyDown) |
    (1ULL << kCGEventFlagsChanged) |
    (1ULL << kCGEventLeftMouseDown) |
    (1ULL << kCGEventRightMouseDown) |
    (1ULL << kCGEventOtherMouseDown);

CGEventRef tapCallback(CGEventTapProxy, CGEventType type, CGEventRef event, void*) {
  if (type == kCGEventTapDisabledByTimeout || type == kCGEventTapDisabledByUserInput) {
    disabledCount.fetch_add(1, std::memory_order_relaxed);
    // The tap can be disabled after a scheduler stall even when the grant is
    // still valid. Re-enable immediately; if TCC revoked access, the next
    // callback / preflight reports it and JavaScript can show the repair path.
    if (eventTap) CGEventTapEnable(eventTap, true);
    return event;
  }
  if (!running.load(std::memory_order_relaxed)) return event;

  switch (type) {
    case kCGEventKeyDown:
      // Holding a key produces repeated key-down events. Count physical presses,
      // not the OS repeat stream, so the cat matches what the user is doing.
      if (!CGEventGetIntegerValueField(event, kCGKeyboardEventAutorepeat)) {
        keyboardCount.fetch_add(1, std::memory_order_relaxed);
      }
      break;
    case kCGEventFlagsChanged: {
      // Modifier keys only emit FlagsChanged. Count the press edge, not the
      // release edge, by looking for a newly set modifier bit. The flags are
      // inspected transiently and never exposed to JavaScript.
      static constexpr CGEventFlags kModifierMasks[] = {
          kCGEventFlagMaskShift,
          kCGEventFlagMaskControl,
          kCGEventFlagMaskAlternate,
          kCGEventFlagMaskCommand,
          kCGEventFlagMaskSecondaryFn,
      };
      const CGEventFlags previousModifiers =
          static_cast<CGEventFlags>(modifierState.load(std::memory_order_relaxed));
      const CGEventFlags current = CGEventGetFlags(event) & (kCGEventFlagMaskShift |
          kCGEventFlagMaskControl | kCGEventFlagMaskAlternate |
          kCGEventFlagMaskCommand | kCGEventFlagMaskSecondaryFn);
      bool pressed = false;
      for (const CGEventFlags mask : kModifierMasks) {
        if ((current & mask) && !(previousModifiers & mask)) pressed = true;
      }
      // Caps Lock is a latch and has no key-up event. Every FlagsChanged for it
      // is a physical press, so its toggled bit must count as an edge.
      if (CGEventGetIntegerValueField(event, kCGKeyboardEventKeycode) == 57) pressed = true;
      if (pressed) keyboardCount.fetch_add(1, std::memory_order_relaxed);
      modifierState.store(current, std::memory_order_relaxed);
      break;
    }
    case kCGEventLeftMouseDown:
    case kCGEventRightMouseDown:
    case kCGEventOtherMouseDown:
      clickCount.fetch_add(1, std::memory_order_relaxed);
      break;
    default:
      break;
  }
  return event;
}

void runTap() {
  CFRunLoopRef loop = CFRunLoopGetCurrent();
  CFRetain(loop);
  runLoop.store(loop, std::memory_order_release);

  CFRunLoopAddSource(loop, eventSource, kCFRunLoopCommonModes);
  CGEventTapEnable(eventTap, true);

  while (!stopRequested.load(std::memory_order_acquire)) {
    // A bounded slice makes stop deterministic without relying on a second
    // thread touching a run loop that is in the middle of teardown.
    CFRunLoopRunInMode(kCFRunLoopDefaultMode, 0.2, true);
  }

  running.store(false, std::memory_order_release);
  CGEventTapEnable(eventTap, false);
  CFRunLoopRemoveSource(loop, eventSource, kCFRunLoopCommonModes);
  runLoop.store(nullptr, std::memory_order_release);
  CFRelease(loop);
}

void stopTapLocked() {
  stopRequested.store(true, std::memory_order_release);
  CFRunLoopRef loop = runLoop.load(std::memory_order_acquire);
  if (loop) CFRunLoopStop(loop);
  if (worker.joinable()) worker.join();
  running.store(false, std::memory_order_release);
  if (eventTap) {
    CFMachPortInvalidate(eventTap);
    CFRelease(eventTap);
    eventTap = nullptr;
  }
  if (eventSource) {
    CFRelease(eventSource);
    eventSource = nullptr;
  }
  stopRequested.store(false, std::memory_order_release);
}

napi_value boolean(napi_env env, bool value) {
  napi_value result;
  napi_get_boolean(env, value, &result);
  return result;
}

napi_value number(napi_env env, uint64_t value) {
  napi_value result;
  napi_create_double(env, static_cast<double>(value), &result);
  return result;
}

napi_value preflight(napi_env env, napi_callback_info) {
  return boolean(env, CGPreflightListenEventAccess());
}

napi_value request(napi_env env, napi_callback_info) {
  return boolean(env, CGRequestListenEventAccess());
}

napi_value start(napi_env env, napi_callback_info) {
  std::lock_guard<std::mutex> lock(lifecycleMutex);
  if (worker.joinable()) return boolean(env, true);
  if (!CGPreflightListenEventAccess()) return boolean(env, false);

  eventTap = CGEventTapCreate(kCGHIDEventTap, kCGHeadInsertEventTap,
                              kCGEventTapOptionListenOnly, kEventMask,
                              tapCallback, nullptr);
  if (!eventTap) return boolean(env, false);
  eventSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, eventTap, 0);
  if (!eventSource) {
    CFRelease(eventTap);
    eventTap = nullptr;
    return boolean(env, false);
  }

  stopRequested.store(false, std::memory_order_release);
  modifierState.store(0, std::memory_order_relaxed);
  running.store(true, std::memory_order_release);
  worker = std::thread(runTap);
  return boolean(env, true);
}

napi_value stop(napi_env env, napi_callback_info) {
  std::lock_guard<std::mutex> lock(lifecycleMutex);
  if (worker.joinable()) stopTapLocked();
  return boolean(env, true);
}

napi_value status(napi_env env, napi_callback_info) {
  napi_value result, value;
  napi_create_object(env, &result);
  napi_create_string_utf8(env, "macOS Input Monitoring", NAPI_AUTO_LENGTH, &value);
  napi_set_named_property(env, result, "kind", value);
  napi_set_named_property(env, result, "running", boolean(env, running.load()));
  napi_set_named_property(env, result, "permission", boolean(env, CGPreflightListenEventAccess()));
  napi_set_named_property(env, result, "disabled", number(env, disabledCount.load()));
  return result;
}

napi_value drain(napi_env env, napi_callback_info) {
  napi_value result;
  napi_create_object(env, &result);
  napi_set_named_property(env, result, "keyboard",
      number(env, keyboardCount.exchange(0, std::memory_order_relaxed)));
  napi_set_named_property(env, result, "click",
      number(env, clickCount.exchange(0, std::memory_order_relaxed)));
  return result;
}

napi_value resetCounters(napi_env env, napi_callback_info) {
  keyboardCount.store(0, std::memory_order_relaxed);
  clickCount.store(0, std::memory_order_relaxed);
  disabledCount.store(0, std::memory_order_relaxed);
  modifierState.store(0, std::memory_order_relaxed);
  return boolean(env, true);
}

}  // namespace

NAPI_MODULE_INIT() {
  const napi_property_descriptor properties[] = {
      {"preflight", nullptr, preflight, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"request", nullptr, request, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"start", nullptr, start, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"stop", nullptr, stop, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"status", nullptr, status, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"drain", nullptr, drain, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"reset", nullptr, resetCounters, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napi_define_properties(env, exports, sizeof(properties) / sizeof(properties[0]), properties);
  return exports;
}
