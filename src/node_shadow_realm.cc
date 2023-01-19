#include "node_shadow_realm.h"

#include "node.h"
#include "env-inl.h"

namespace node {

class Environment;

namespace shadow_realm {
using v8::Context;
using v8::Isolate;
using v8::Local;
using v8::MaybeLocal;

// static
MaybeLocal<Context> HostCreateShadowRealmContextCallback(
    Local<Context> initiator_context) {
  Isolate* isolate = initiator_context->GetIsolate();
  Local<Context> context = Context::New(isolate);
  Environment* initiator_env = Environment::GetCurrent(isolate);
  IsolateData* isolate_data = CreateIsolateData(
    isolate,
    initiator_env->event_loop(),
    initiator_env->isolate_data()->platform(),
    initiator_env->isolate_data()->node_allocator()
  );
  uint64_t env_flags = EnvironmentFlags::kDefaultFlags |
                       EnvironmentFlags::kNoCreateInspector;
  const std::vector<std::string> args;
  const std::vector<std::string> exec_args;

  Environment* env = CreateEnvironment(
    isolate_data,
    context,
    args,
    exec_args,
    static_cast<EnvironmentFlags::Flags>(env_flags)
  );
  // TODO(cjihrig): Assert env not null.

  return context;
}

}  // namespace shadow_realm
}  // namespace node
