#pragma once

#if defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#include "base_object.h"
#include "ffi.h"
#include "uv.h"

#include <cstdint>
#include <memory>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

using v8::Function;
using v8::FunctionCallbackInfo;
using v8::FunctionTemplate;
using v8::Global;
using v8::Local;
using v8::Object;
using v8::Value;
using v8::WeakCallbackInfo;

namespace node::ffi {

class DynamicLibrary;
struct FFIFunction;

struct FFIFunction {
  bool closed;

  void* ptr;
  ffi_cif cif;
  std::vector<ffi_type*> args;
  ffi_type* return_type;
};

struct FFIFunctionInfo {
  std::shared_ptr<FFIFunction> fn;
  Global<Function> self;
};

struct FFICallback {
  DynamicLibrary* owner;
  Environment* env;
  std::thread::id thread_id;
  Global<Function> fn;
  ffi_closure* closure;

  void* ptr;
  ffi_cif cif;
  std::vector<ffi_type*> args;
  ffi_type* return_type;

  ~FFICallback() {
    if (!fn.IsEmpty()) {
      fn.Reset();
    }

    if (closure != nullptr) {
      ffi_closure_free(closure);
      closure = nullptr;
    }
  }
};

struct ResolvedFunction {
  std::string name;
  std::shared_ptr<FFIFunction> fn;
  bool should_cache_symbol;
  bool should_cache_function;
};

class DynamicLibrary : public BaseObject {
 public:
  DynamicLibrary(Environment* env, Local<Object> object);
  ~DynamicLibrary() override;

  void MemoryInfo(MemoryTracker* tracker) const override;

  static Local<FunctionTemplate> GetConstructorTemplate(Environment* env);
  static void New(const FunctionCallbackInfo<Value>& args);
  static void Close(const FunctionCallbackInfo<Value>& args);
  static void InvokeFunction(const FunctionCallbackInfo<Value>& args);
  static void InvokeCallback(ffi_cif* cif,
                             void* ret,
                             void** args,
                             void* user_data);

  static void GetPath(const FunctionCallbackInfo<Value>& args);
  static void GetFunction(const FunctionCallbackInfo<Value>& args);
  static void GetFunctions(const FunctionCallbackInfo<Value>& args);
  static void GetSymbol(const FunctionCallbackInfo<Value>& args);
  static void GetSymbols(const FunctionCallbackInfo<Value>& args);

  static void RegisterCallback(const FunctionCallbackInfo<Value>& args);
  static void UnregisterCallback(const FunctionCallbackInfo<Value>& args);
  static void RefCallback(const FunctionCallbackInfo<Value>& args);
  static void UnrefCallback(const FunctionCallbackInfo<Value>& args);

  SET_MEMORY_INFO_NAME(DynamicLibrary)
  SET_SELF_SIZE(DynamicLibrary)

 private:
  void Close();
  bool ResolveSymbol(Environment* env, const std::string& name, void** ptr);
  bool PrepareFunction(Environment* env,
                       const std::string& name,
                       Local<Object> signature,
                       std::shared_ptr<FFIFunction>* ret,
                       bool* should_cache_symbol,
                       bool* should_cache_function);
  Local<Function> CreateFunction(Environment* env,
                                 const std::string& name,
                                 const std::shared_ptr<FFIFunction>& fn);
  static void CleanupFunctionInfo(
      const WeakCallbackInfo<FFIFunctionInfo>& data);

  uv_lib_t lib_;
  void* handle_;
  std::string path_;
  std::unordered_map<std::string, void*> symbols_;
  std::unordered_map<std::string, std::shared_ptr<FFIFunction>> functions_;
  std::unordered_map<void*, std::unique_ptr<FFICallback>> callbacks_;
};

void GetInt8(const FunctionCallbackInfo<Value>& args);
void GetUint8(const FunctionCallbackInfo<Value>& args);
void GetInt16(const FunctionCallbackInfo<Value>& args);
void GetUint16(const FunctionCallbackInfo<Value>& args);
void GetInt32(const FunctionCallbackInfo<Value>& args);
void GetUint32(const FunctionCallbackInfo<Value>& args);
void GetInt64(const FunctionCallbackInfo<Value>& args);
void GetUint64(const FunctionCallbackInfo<Value>& args);
void GetFloat32(const FunctionCallbackInfo<Value>& args);
void GetFloat64(const FunctionCallbackInfo<Value>& args);

void SetInt8(const FunctionCallbackInfo<Value>& args);
void SetUint8(const FunctionCallbackInfo<Value>& args);
void SetInt16(const FunctionCallbackInfo<Value>& args);
void SetUint16(const FunctionCallbackInfo<Value>& args);
void SetInt32(const FunctionCallbackInfo<Value>& args);
void SetUint32(const FunctionCallbackInfo<Value>& args);
void SetInt64(const FunctionCallbackInfo<Value>& args);
void SetUint64(const FunctionCallbackInfo<Value>& args);
void SetFloat32(const FunctionCallbackInfo<Value>& args);
void SetFloat64(const FunctionCallbackInfo<Value>& args);

void ToString(const FunctionCallbackInfo<Value>& args);
void ToBuffer(const FunctionCallbackInfo<Value>& args);
void ToArrayBuffer(const FunctionCallbackInfo<Value>& args);

}  // namespace node::ffi

#endif  // defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS
