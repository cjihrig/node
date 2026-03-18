#pragma once

#if defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#include "base_object.h"
#include "ffi.h"

#include <cstdint>
#include <string>
#include <vector>

using v8::FunctionCallbackInfo;
using v8::Isolate;
using v8::Local;
using v8::Object;
using v8::Value;

namespace node::ffi {

struct FFIFunction;

bool ThrowIfContainsNullBytes(Environment* env,
                              const node::Utf8Value& value,
                              const std::string& label);

bool ParseFunctionSignature(Environment* env,
                            const std::string& name,
                            Local<Object> signature,
                            ffi_type** return_type,
                            std::vector<ffi_type*>* args);

bool ToFFIType(Environment* env, const std::string& type_str, ffi_type** ret);

uint8_t ToFFIArgument(Environment* env,
                      unsigned int index,
                      ffi_type* type,
                      Local<Value> arg,
                      void* ret);

Local<Value> ToJSArgument(Isolate* isolate, ffi_type* type, void* data);

bool ToJSReturnValue(Environment* env,
                     const FunctionCallbackInfo<Value>& args,
                     ffi_type* type,
                     void* result);

bool ToFFIReturnValue(Local<Value> result, ffi_type* type, void* ret);

bool SignaturesMatch(const FFIFunction& fn,
                     ffi_type* return_type,
                     const std::vector<ffi_type*>& args);

}  // namespace node::ffi

#endif  // defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS
