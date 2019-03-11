// Copyright 2011 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef V8_MIPS_FRAME_CONSTANTS_MIPS_H_
#define V8_MIPS_FRAME_CONSTANTS_MIPS_H_

#include "src/base/macros.h"
#include "src/frame-constants.h"

namespace v8 {
namespace internal {

class EntryFrameConstants : public AllStatic {
 public:
  // This is the offset to where JSEntry pushes the current value of
  // Isolate::c_entry_fp onto the stack.
  static constexpr int kCallerFPOffset =
      -(StandardFrameConstants::kFixedFrameSizeFromFp + kPointerSize);

  // Stack offsets for arguments passed to JSEntry.
  static constexpr int kArgcOffset = +0 * kSystemPointerSize;
  static constexpr int kArgvOffset = +1 * kSystemPointerSize;
};

class ExitFrameConstants : public TypedFrameConstants {
 public:
  static constexpr int kSPOffset = TYPED_FRAME_PUSHED_VALUE_OFFSET(0);
  static constexpr int kCodeOffset = TYPED_FRAME_PUSHED_VALUE_OFFSET(1);
  DEFINE_TYPED_FRAME_SIZES(2);

  // The caller fields are below the frame pointer on the stack.
  static constexpr int kCallerFPOffset = +0 * kPointerSize;
  // The calling JS function is between FP and PC.
  static constexpr int kCallerPCOffset = +1 * kPointerSize;

  // MIPS-specific: a pointer to the old sp to avoid unnecessary calculations.
  static constexpr int kCallerSPOffset = +2 * kPointerSize;

  // FP-relative displacement of the caller's SP.
  static constexpr int kCallerSPDisplacement = +2 * kPointerSize;

  static constexpr int kConstantPoolOffset = 0;  // Not used.
};

class WasmCompileLazyFrameConstants : public TypedFrameConstants {
 public:
  static constexpr int kNumberOfSavedGpParamRegs = 3;
  static constexpr int kNumberOfSavedFpParamRegs = 7;

  // FP-relative.
  static constexpr int kWasmInstanceOffset = TYPED_FRAME_PUSHED_VALUE_OFFSET(3);
  static constexpr int kFixedFrameSizeFromFp =
      TypedFrameConstants::kFixedFrameSizeFromFp +
      kNumberOfSavedGpParamRegs * kPointerSize +
      kNumberOfSavedFpParamRegs * kDoubleSize;
};

class JavaScriptFrameConstants : public AllStatic {
 public:
  // FP-relative.
  static constexpr int kLocal0Offset =
      StandardFrameConstants::kExpressionsOffset;
  static constexpr int kLastParameterOffset = +2 * kPointerSize;
  static constexpr int kFunctionOffset =
      StandardFrameConstants::kFunctionOffset;

  // Caller SP-relative.
  static constexpr int kParam0Offset = -2 * kPointerSize;
  static constexpr int kReceiverOffset = -1 * kPointerSize;
};

}  // namespace internal
}  // namespace v8

#endif  // V8_MIPS_FRAME_CONSTANTS_MIPS_H_
