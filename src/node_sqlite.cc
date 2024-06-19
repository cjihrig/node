#include "node_sqlite.h"
#include "base_object-inl.h"
#include "debug_utils-inl.h"
#include "env-inl.h"
#include "memory_tracker-inl.h"
#include "node.h"
#include "node_errors.h"
#include "node_mem-inl.h"
#include "sqlite3.h"
#include "util-inl.h"

#include <cinttypes>

namespace node {
namespace sqlite {

using v8::Array;
using v8::ArrayBuffer;
using v8::Boolean;
using v8::Context;
using v8::Exception;
using v8::FunctionCallbackInfo;
using v8::FunctionTemplate;
using v8::Integer;
using v8::Isolate;
using v8::Local;
using v8::Number;
using v8::Object;
using v8::String;
using v8::Uint8Array;
using v8::Value;

#define CHECK_ERROR_OR_THROW(isolate, db, expr, expected, ret)                 \
  do {                                                                         \
    int r_ = (expr);                                                           \
    if (r_ != (expected)) {                                                    \
      THROW_ERR_SQLITE_ERROR((isolate), (db));                                 \
      return (ret);                                                            \
    }                                                                          \
  } while (0)

inline Local<Value> CreateSQLiteError(Isolate* isolate, sqlite3* db) {
  int errcode = sqlite3_extended_errcode(db);
  const char* errstr = sqlite3_errstr(errcode);
  const char* errmsg = sqlite3_errmsg(db);
  Local<String> js_msg = String::NewFromUtf8(isolate, errmsg).ToLocalChecked();
  Local<Object> e = Exception::Error(js_msg)
                                ->ToObject(isolate->GetCurrentContext())
                                .ToLocalChecked();
  e->Set(isolate->GetCurrentContext(),
         OneByteString(isolate, "code"),
         OneByteString(isolate, "ERR_SQLITE_ERROR"))
      .Check();
  e->Set(isolate->GetCurrentContext(),
         OneByteString(isolate, "errcode"),
         Integer::New(isolate, errcode))
      .Check();
  e->Set(isolate->GetCurrentContext(),
         OneByteString(isolate, "errstr"),
         String::NewFromUtf8(isolate, errstr).ToLocalChecked())
      .Check();
  return e;
}

inline void THROW_ERR_SQLITE_ERROR(Isolate* isolate, sqlite3* db) {
  isolate->ThrowException(CreateSQLiteError(isolate, db));
}

inline bool IsPOJO(Local<Value> maybe_obj) {
  if (!maybe_obj->IsObject()) {
    return false;
  }

  Local<Object> obj = maybe_obj.As<Object>();
  Isolate* isolate = obj->GetIsolate();
  Local<Value> proto = obj->GetPrototype();
  if (proto->StrictEquals(v8::Null(isolate))) {
    return true;
  }

  Local<Value> pojoProto = Object::New(isolate)->GetPrototype();
  return proto->StrictEquals(pojoProto);
}

SQLiteDatabaseSync::SQLiteDatabaseSync(Environment* env, Local<Object> object, Local<String> location, bool open)
    : BaseObject(env, object) {
  MakeWeak();
  node::Utf8Value utf8_location(env->isolate(), location);
  location_ = utf8_location.ToString();

  if (open) {
    // TODO(cjihrig): Reduce code duplication.
    int r = sqlite3_open(location_.c_str(), &connection_);
    if (r != SQLITE_OK) {
      THROW_ERR_SQLITE_ERROR(env->isolate(), connection_);
      return;
    }
  } else {
    connection_ = nullptr;
  }
}

SQLiteDatabaseSync::~SQLiteDatabaseSync() {
  // TODO(cjihrig): ...
  connection_ = nullptr;
}

void SQLiteDatabaseSync::MemoryInfo(MemoryTracker* tracker) const {
  tracker->TrackField("location", location_);
}

bool SQLiteDatabaseSync::Open() {
  // TODO(cjihrig): ...
  return true;
}

void SQLiteDatabaseSync::New(const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);

  if (!args.IsConstructCall()) {
    THROW_ERR_CONSTRUCT_CALL_REQUIRED(env);
    return;
  }

  if (!args[0]->IsString()) {
    node::THROW_ERR_INVALID_ARG_TYPE(
        env->isolate(),
        "The \"path\" argument must be a string.");
    return;
  }

  bool open = true;

  if (args.Length() > 1) {
    if (!args[1]->IsObject()) {
      node::THROW_ERR_INVALID_ARG_TYPE(
          env->isolate(),
          "The \"options\" argument must be an object.");
      return;
    }

    Local<Object> options = args[1].As<Object>();
    Local<String> open_string = FIXED_ONE_BYTE_STRING(env->isolate(), "open");
    Local<Value> open_v;
    if (!options->Get(env->context(), open_string).ToLocal(&open_v)) {
      return;
    }
    if (!open_v->IsUndefined()) {
      if (!open_v->IsBoolean()) {
        node::THROW_ERR_INVALID_ARG_TYPE(
            env->isolate(),
            "The \"options.open\" argument must be a boolean.");
        return;
      }
      open = open_v.As<Boolean>()->Value();
    }
  }

  new SQLiteDatabaseSync(env, args.This(), args[0].As<String>(), open);
}

void SQLiteDatabaseSync::Open(const FunctionCallbackInfo<Value>& args) {
  SQLiteDatabaseSync* db;
  ASSIGN_OR_RETURN_UNWRAP(&db, args.This());
  Environment* env = Environment::GetCurrent(args);

  if (db->connection_ != nullptr) {
    node::THROW_ERR_INVALID_STATE(env, "database is already open");
    return;
  }

  int r = sqlite3_open(db->location_.c_str(), &db->connection_);
  CHECK_ERROR_OR_THROW(env->isolate(), db->connection_, r, SQLITE_OK, void());
}

void SQLiteDatabaseSync::Close(const FunctionCallbackInfo<Value>& args) {
  SQLiteDatabaseSync* db;
  ASSIGN_OR_RETURN_UNWRAP(&db, args.This());
  Environment* env = Environment::GetCurrent(args);

  if (db->connection_ == nullptr) {
    // TODO(cjihrig): Code duplication.
    node::THROW_ERR_INVALID_STATE(env, "database is not open");
    return;
  }

  int r = sqlite3_close(db->connection_);
  CHECK_ERROR_OR_THROW(env->isolate(), db->connection_, r, SQLITE_OK, void());
  db->connection_ = nullptr;
}

void SQLiteDatabaseSync::Prepare(const FunctionCallbackInfo<Value>& args) {
  SQLiteDatabaseSync* db;
  ASSIGN_OR_RETURN_UNWRAP(&db, args.This());
  Environment* env = Environment::GetCurrent(args);

  if (db->connection_ == nullptr) {
    // TODO(cjihrig): Code duplication.
    node::THROW_ERR_INVALID_STATE(env, "database is not open");
    return;
  }

  if (!args[0]->IsString()) {
    node::THROW_ERR_INVALID_ARG_TYPE(
        env->isolate(),
        "The \"sql\" argument must be a string.");
    return;
  }

  auto sql = node::Utf8Value(env->isolate(), args[0].As<String>());
  sqlite3_stmt* s = nullptr;
  int r = sqlite3_prepare_v2(db->connection_, *sql, -1, &s, 0);
  CHECK_ERROR_OR_THROW(env->isolate(), db->connection_, r, SQLITE_OK, void());
  BaseObjectPtr<SQLiteStatementSync> stmt = SQLiteStatementSync::Create(env, db->connection_, s);
  args.GetReturnValue().Set(stmt->object());
}


SQLiteStatementSync::SQLiteStatementSync(Environment* env, Local<Object> object, sqlite3* db, sqlite3_stmt* stmt)
    : BaseObject(env, object) {
  MakeWeak();
  db_ = db;
  statement_ = stmt;

  // TODO(cjihrig): We need some map here if we want to support unprefixed ($,:,@) named parameters.
  int param_count = sqlite3_bind_parameter_count(stmt);
  // Parameter indexing starts at one.
  for (int i = 1; i <= param_count; ++i) {
    const char* name = sqlite3_bind_parameter_name(stmt, i);
    if (name != nullptr) {
      printf("NAMED PARAM %d = %s\n", i, name);
    }
  }
}

SQLiteStatementSync::~SQLiteStatementSync() {
  // TODO(cjihrig): ...
  statement_ = nullptr;
}

bool SQLiteStatementSync::BindParams(const FunctionCallbackInfo<Value>& args) {
  int anon_idx = 1;

  for (int i = 0; i < args.Length(); ++i) {
    if (IsPOJO(args[i])) {
      Local<Object> obj = args[i].As<Object>();
      Local<Context> context = obj->GetIsolate()->GetCurrentContext();
      Local<Array> keys;
      if (!obj->GetOwnPropertyNames(context).ToLocal(&keys)) {
        return false;
      }

      uint32_t len = keys->Length();
      for (uint32_t j = 0; j < len; j++) {
        Local<Value> key;
        if (!keys->Get(context, j).ToLocal(&key)) {
          return false;
        }

        if (!key->IsString()) {
          // TODO(cjihrig): Handle non-strings.
        }

        auto utf8_key = node::Utf8Value(env()->isolate(), key);
        int r = sqlite3_bind_parameter_index(statement_, *utf8_key);
        if (r == 0) {
          // TODO(cjihrig): Report error.
          printf("could not find index for parameter: %s\n", *utf8_key);
          return false;
        }

        Local<Value> value;
        if (!obj->Get(context, key).ToLocal(&value)) {
          return false;
        }

        if (!BindValue(value, r)) {
          node::THROW_ERR_INVALID_ARG_TYPE(
              env()->isolate(),
              "Named parameter '%s' in argument %" PRIu32
              " cannot be bound to SQLite.",
              *utf8_key,
              i + 1);
          return false;
        }
      }
    } else if (args[i]->IsArray()) {
      // TODO(cjihrig): Support arrays of anonymous parameters.
    } else {
      while (sqlite3_bind_parameter_name(statement_, anon_idx) != nullptr) {
        anon_idx++;
      }

      if (!BindValue(args[i], anon_idx)) {
        node::THROW_ERR_INVALID_ARG_TYPE(
            env()->isolate(),
            "Anonymous parameter in argument %d cannot be bound to SQLite.",
            i + 1);
        return false;
      }

      anon_idx++;
    }
  }

  return true;
}

bool SQLiteStatementSync::BindValue(const Local<Value>& value, const int index) {
  // TODO(cjihrig): Do we want to support data that can't be round tripped like
  // booleans. This also applies to some numbers and blob data.
  int r;
  if (value->IsNumber()) {
    // TODO(cjihrig): Handle int and bigint
    double val = value.As<Number>()->Value();
    r = sqlite3_bind_double(statement_, index, val);
  } else if (value->IsString()) {
    auto val = node::Utf8Value(env()->isolate(), value.As<String>());
    r = sqlite3_bind_text(statement_, index, *val, val.length(), SQLITE_TRANSIENT);
  } else if (value->IsNull()) {
    r = sqlite3_bind_null(statement_, index);
  } else if (value->IsTypedArray() || value->IsArrayBuffer() || value->IsSharedArrayBuffer()) {
    ArrayBufferViewContents<uint8_t> buf(value);
    r = sqlite3_bind_blob(statement_, index, buf.data(), buf.length(), SQLITE_TRANSIENT);
  } else {
    return false;
  }

  CHECK_ERROR_OR_THROW(env()->isolate(), db_, r, SQLITE_OK, false);
  return true;
}

Local<Value> SQLiteStatementSync::ColumnToValue(const int column) {
  int col_type = sqlite3_column_type(statement_, column);

  if (col_type == SQLITE_INTEGER) {
    int value = sqlite3_column_int(statement_, column);
    return Number::New(env()->isolate(), value);
  } else if (col_type == SQLITE_FLOAT) {
    double value = sqlite3_column_double(statement_, column);
    return Number::New(env()->isolate(), value);
  } else if (col_type == SQLITE_TEXT) {
    const char* value = reinterpret_cast<const char*>(sqlite3_column_text(statement_, column));
    Local<Value> val;
    if (!String::NewFromUtf8(env()->isolate(), value).ToLocal(&val)) {
      return Local<Value>();
    }
    return val;
  } else if (col_type == SQLITE_NULL) {
    return v8::Null(env()->isolate());
  } else if (col_type == SQLITE_BLOB) {
    size_t size = static_cast<size_t>(sqlite3_column_bytes(statement_, column));
    auto data = reinterpret_cast<const uint8_t*>(sqlite3_column_blob(statement_, column));
    auto store = ArrayBuffer::NewBackingStore(env()->isolate(), size);
    memcpy(store->Data(), data, size);
    auto ab = ArrayBuffer::New(env()->isolate(), std::move(store));
    return Uint8Array::New(ab, 0, size);
  }

  UNREACHABLE();
}

Local<Value> SQLiteStatementSync::ColumnNameToValue(const int column) {
  const char* col_name = sqlite3_column_name(statement_, column);
  if (col_name == nullptr) {
    node::THROW_ERR_INVALID_STATE(
        env(), "Cannot get name of column %d", column);
    return Local<Value>();
  }

  Local<String> key;
  if (!String::NewFromUtf8(env()->isolate(), col_name).ToLocal(&key)) {
    return Local<Value>();
  }
  return key;
}

void SQLiteStatementSync::MemoryInfo(MemoryTracker* tracker) const {
  // TODO(cjihrig): ...
}

void SQLiteStatementSync::All(const FunctionCallbackInfo<Value>& args) {
  SQLiteStatementSync* stmt;
  ASSIGN_OR_RETURN_UNWRAP(&stmt, args.This());
  Environment* env = Environment::GetCurrent(args);
  int r = sqlite3_reset(stmt->statement_);
  CHECK_ERROR_OR_THROW(env->isolate(), stmt->db_, r, SQLITE_OK, void());

  if (!stmt->BindParams(args)) {
    return;
  }

  int num_cols = sqlite3_column_count(stmt->statement_);
  std::vector<Local<Value>> rows;
  while ((r = sqlite3_step(stmt->statement_)) == SQLITE_ROW) {
    Local<Object> row = Object::New(env->isolate());

    for (int i = 0; i < num_cols; ++i) {
      Local<Value> key = stmt->ColumnNameToValue(i);
      Local<Value> val = stmt->ColumnToValue(i);

      if (row->Set(env->context(), key, val).IsNothing()) {
        return;
      }
    }

    rows.emplace_back(row);
  }

  CHECK_ERROR_OR_THROW(env->isolate(), stmt->db_, r, SQLITE_DONE, void());
  args.GetReturnValue().Set(Array::New(env->isolate(), rows.data(), rows.size()));
}

void SQLiteStatementSync::Get(const FunctionCallbackInfo<Value>& args) {
  SQLiteStatementSync* stmt;
  ASSIGN_OR_RETURN_UNWRAP(&stmt, args.This());
  Environment* env = Environment::GetCurrent(args);
  int r = sqlite3_reset(stmt->statement_);
  CHECK_ERROR_OR_THROW(env->isolate(), stmt->db_, r, SQLITE_OK, void());

  if (!stmt->BindParams(args)) {
    return;
  }

  r = sqlite3_step(stmt->statement_);
  if (r != SQLITE_ROW) {
    CHECK_ERROR_OR_THROW(env->isolate(), stmt->db_, r, SQLITE_DONE, void());
    return;
  }

  int num_cols = sqlite3_column_count(stmt->statement_);
  if (num_cols == 0) {
    return;
  }

  Local<Object> result = Object::New(env->isolate());

  for (int i = 0; i < num_cols; ++i) {
    Local<Value> key = stmt->ColumnNameToValue(i);
    Local<Value> val = stmt->ColumnToValue(i);

    if (result->Set(env->context(), key, val).IsNothing()) {
      return;
    }
  }

  args.GetReturnValue().Set(result);
}

void SQLiteStatementSync::Run(const FunctionCallbackInfo<Value>& args) {
  SQLiteStatementSync* stmt;
  ASSIGN_OR_RETURN_UNWRAP(&stmt, args.This());
  Environment* env = Environment::GetCurrent(args);
  int r = sqlite3_reset(stmt->statement_);
  CHECK_ERROR_OR_THROW(env->isolate(), stmt->db_, r, SQLITE_OK, void());

  if (!stmt->BindParams(args)) {
    return;
  }

  r = sqlite3_step(stmt->statement_);
  if (r != SQLITE_ROW && r != SQLITE_DONE) {
    THROW_ERR_SQLITE_ERROR(env->isolate(), stmt->db_);
  }
}

void IllegalConstructor(const FunctionCallbackInfo<Value>& args) {
  node::THROW_ERR_ILLEGAL_CONSTRUCTOR(Environment::GetCurrent(args));
}

Local<FunctionTemplate> SQLiteStatementSync::GetConstructorTemplate(Environment* env) {
  Local<FunctionTemplate> tmpl = env->sqlite_statement_sync_constructor_template();
  if (tmpl.IsEmpty()) {
    Isolate* isolate = env->isolate();
    tmpl = NewFunctionTemplate(isolate, IllegalConstructor);
    tmpl->SetClassName(FIXED_ONE_BYTE_STRING(env->isolate(), "SQLiteStatementSync"));
    tmpl->InstanceTemplate()->SetInternalFieldCount(
        SQLiteStatementSync::kInternalFieldCount);
    SetProtoMethod(isolate, tmpl, "all", SQLiteStatementSync::All);
    SetProtoMethod(isolate, tmpl, "get", SQLiteStatementSync::Get);
    SetProtoMethod(isolate, tmpl, "run", SQLiteStatementSync::Run);
    env->set_sqlite_statement_sync_constructor_template(tmpl);
  }
  return tmpl;
}

BaseObjectPtr<SQLiteStatementSync> SQLiteStatementSync::Create(Environment* env, sqlite3* db, sqlite3_stmt* stmt) {
  Local<Object> obj;
  if (!GetConstructorTemplate(env)
          ->InstanceTemplate()
          ->NewInstance(env->context()).ToLocal(&obj)) {
    return BaseObjectPtr<SQLiteStatementSync>();
  }

  return MakeBaseObject<SQLiteStatementSync>(env, obj, db, stmt);
}


static void Initialize(Local<Object> target,
                       Local<Value> unused,
                       Local<Context> context,
                       void* priv) {
  Environment* env = Environment::GetCurrent(context);
  Isolate* isolate = env->isolate();
  Local<FunctionTemplate> db_tmpl = NewFunctionTemplate(isolate, SQLiteDatabaseSync::New);
  db_tmpl->InstanceTemplate()->SetInternalFieldCount(SQLiteDatabaseSync::kInternalFieldCount);

  SetProtoMethod(isolate, db_tmpl, "close", SQLiteDatabaseSync::Close);
  SetProtoMethod(isolate, db_tmpl, "open", SQLiteDatabaseSync::Open);
  SetProtoMethod(isolate, db_tmpl, "prepare", SQLiteDatabaseSync::Prepare);
  SetConstructorFunction(context, target, "SQLiteDatabaseSync", db_tmpl);
  SetConstructorFunction(context, target, "SQLiteStatementSync", SQLiteStatementSync::GetConstructorTemplate(env));
}

}  // namespace sqlite
}  // namespace node

NODE_BINDING_CONTEXT_AWARE_INTERNAL(sqlite, node::sqlite::Initialize)
