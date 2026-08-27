cmake_minimum_required(VERSION 3.22.1)

project("luna-local-llm" VERSION 1.0.0 LANGUAGES C CXX)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED true)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED true)

# --------------------------------------------------------------------------
# Fetch llama.cpp's source at configure time instead of vendoring ~170MB of
# C++ into this git repo. Pinned to a specific commit for reproducibility -
# this is the commit the JNI glue in ai_chat.cpp (adapted from llama.cpp's
# own examples/llama.android reference app) was verified to compile against.
#
# First build needs internet access and will take a while (clones llama.cpp,
# then compiles it); Gradle/CMake caches it after that.
# --------------------------------------------------------------------------

include(FetchContent)
FetchContent_Declare(
        llama_cpp
        GIT_REPOSITORY https://github.com/ggml-org/llama.cpp.git
        GIT_TAG        f280b26983ad0fdb705a0d9ebf0503e76f2899b0
        GIT_SHALLOW    TRUE
)

# Keep llama.cpp's own build scope minimal - we only need the library, not
# its CLI tools/server/examples/tests.
set(LLAMA_BUILD_COMMON ON CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TOOLS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_SERVER OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_APP OFF CACHE BOOL "" FORCE)
set(LLAMA_OPENSSL OFF CACHE BOOL "" FORCE)
set(BUILD_SHARED_LIBS ON CACHE BOOL "" FORCE)

# Deliberately NOT using GGML_BACKEND_DL/GGML_CPU_ALL_VARIANTS here. That
# configuration builds every CPU-feature variant (generic/dotprod/i8mm/...)
# as separate .so files and dlopens the best match at runtime via
# ggml_backend_load_all_from_path() in ai_chat.cpp's init() - which doesn't
# check whether that call actually found anything. If it silently finds
# zero backends (e.g. a linker/path issue specific to this dynamic-loading
# scheme on a given device), every single model load fails with the same
# generic error regardless of which GGUF file is picked - which is exactly
# what real-device testing on this project hit. A statically-linked CPU
# backend removes that whole failure class: it's registered automatically
# as part of normal shared-library loading, the same reliable mechanism
# every other native lib in this app already depends on. Cost: one generic
# ARMv8-A baseline build instead of per-chip-optimized kernels - slower,
# but it either works or fails in a way that isn't "invisible dlopen no-op".
set(GGML_NATIVE OFF CACHE BOOL "" FORCE)
set(GGML_BACKEND_DL OFF CACHE BOOL "" FORCE)
set(GGML_CPU_ALL_VARIANTS OFF CACHE BOOL "" FORCE)
set(GGML_LLAMAFILE OFF CACHE BOOL "" FORCE)
set(GGML_OPENMP OFF CACHE BOOL "" FORCE)

FetchContent_MakeAvailable(llama_cpp)

# Library name is load-bearing: InferenceEngineImpl.kt calls
# System.loadLibrary("ai-chat") - keep this in sync if either side changes.
add_library(ai-chat SHARED
        ai_chat.cpp)

target_include_directories(ai-chat PRIVATE
        ${llama_cpp_SOURCE_DIR}
        ${llama_cpp_SOURCE_DIR}/common
        ${llama_cpp_SOURCE_DIR}/include
        ${llama_cpp_SOURCE_DIR}/ggml/include
        ${llama_cpp_SOURCE_DIR}/ggml/src)

target_link_libraries(ai-chat
        llama
        llama-common
        android
        log)
