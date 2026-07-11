# MLT Framework Architecture Patterns

## Overview

MLT (Media Lovin' Toolkit) is a professional-grade C++ multimedia framework designed for non-destructive video editing. It uses a service-oriented architecture where source files remain untouched while all edits are stored as metadata configurations.

**Source**: [github.com/mltframework/mlt](https://github.com/mltframework/mlt)

---

## 1. Core Architecture: The Service/Producer/Consumer Model

MLT's architecture is built on a pipeline model with three primary service types:

### 1.1 Service Base Class

All MLT components inherit from `mlt_service_s`. A service can have multiple producer inputs but only a single output (consumer connection).

```
Producer(s) → Service → Consumer
```

**Source**: `src/framework/mlt_service.h`

Key properties:
- `mlt_type` - identifies the subclass
- `in` / `out` - timing metadata for when to start/stop
- `_profile` - resolution, frame rate, aspect ratio
- `_unique_id` - unique identifier

### 1.2 Producer (Data Origin)

A producer generates audio, video, and metadata. It is the **origin of data** within the service network.

**Source**: `src/framework/mlt_producer.h`

Key properties:
- `resource` - file name, stream address, or class name
- `length` - duration in frames
- `in` / `out` - edit points (non-destructive trim points)
- `_cut_parent` - reference to parent producer when this is a cut
- `_speed` - playback speed factor

**Critical insight**: The producer never modifies the source file. Edit points (in/out) are metadata that define which portion of the source to use.

### 1.3 Consumer (Output Destination)

A consumer pulls frames from the connected service graph and outputs to a device, file, or stream.

**Source**: `src/framework/mlt_consumer.h`

Key properties:
- `real_time` - async behavior control
- `mlt_image_format` - output pixel format
- `mlt_audio_format` - output audio format
- `width`, `height` - resolution overrides
- `fps` - frame rate

The consumer only materializes frames at export time — preview uses a lightweight consumer that doesn't encode.

---

## 2. Non-Destructive Timeline Architecture

### 2.1 The Cut Model

MLT uses a **cut** system for non-destructive editing:

```
Original Producer (source file)
    └── Cut Producer (in=100, out=149)
```

A cut is a producer that references a parent producer with specific in/out points. The original media is never modified.

**Source**: `src/framework/mlt_producer.h`

```c
mlt_producer mlt_producer_cut(mlt_producer self, int in, int out);
mlt_producer mlt_producer_cut_parent(mlt_producer self);
int mlt_producer_is_cut(mlt_producer self);
```

**Key properties on a cut**:
- `in` - start frame within source
- `out` - end frame within source  
- `_cut_parent` - reference to original producer

### 2.2 Playlist (Sequential Timeline)

A playlist is a sequential container of producers and blank spaces. It is also a producer itself (composability).

**Source**: `src/framework/mlt_playlist.h`

```c
typedef struct {
    int clip;                 // index in playlist
    mlt_producer producer;    // clip's producer (or parent of cut)
    mlt_producer cut;         // the cut producer
    mlt_position start;       // time relative to playlist start
    mlt_position frame_in;    // clip's in point
    mlt_position frame_out;   // clip's out point
    mlt_position frame_count; // duration of clip
    mlt_position length;      // unedited duration
    float fps;                // frame rate
    int repeat;               // repeat count
} mlt_playlist_clip_info;
```

**Timeline operations** (all non-destructive):
- `mlt_playlist_append_io()` - append with specific in/out points
- `mlt_playlist_insert()` - insert at position
- `mlt_playlist_resize_clip()` - adjust in/out points
- `mlt_playlist_split()` - split a clip
- `mlt_playlist_join()` - merge adjacent clips
- `mlt_playlist_mix()` - add transition between clips

### 2.3 Multitrack (Parallel Layers)

A multitrack contains parallel producers that are mixed together.

**Source**: `src/framework/mlt_multitrack.h`

```c
struct mlt_track_s {
    mlt_producer producer;
    mlt_event event;
};

struct mlt_multitrack_s {
    struct mlt_producer_s parent;  // multitrack IS a producer
    mlt_track *list;
    int size;
    int count;
};
```

Each track is independent. The multitrack itself is a producer, so it can be used in playlists.

### 2.4 Tractor (Timeline Compositor)

The tractor manages a multitrack, track filters, and transitions.

**Source**: `src/framework/mlt_tractor.h`

```c
struct mlt_tractor_s {
    struct mlt_producer_s parent;  // tractor IS a producer
    mlt_service producer;
};
```

The tractor provides:
- `mlt_tractor_field()` - access to the field for transitions/filters
- `mlt_tractor_multitrack()` - access to the tracks
- `mlt_tractor_set_track()` - set a track's producer
- `mlt_tractor_insert_track()` - add a new track

### 2.5 Field (Transition/Filters Container)

The field plants transitions and filters on specific tracks.

**Source**: `src/framework/mlt_field.h`

```c
mlt_field_plant_filter(mlt_field self, mlt_filter that, int track);
mlt_field_plant_transition(mlt_field self, mlt_transition that, int a_track, int b_track);
```

---

## 3. Processing Chain Without Altering Source Files

### 3.1 Frame-Based Lazy Evaluation

MLT uses lazy evaluation with a stack-based processing model:

**Source**: `src/framework/mlt_frame.h`

```c
struct mlt_frame_s {
    struct mlt_properties_s parent;
    int (*convert_image)(...);
    int (*convert_audio)(...);
    mlt_deque stack_image;   // image processing stack
    mlt_deque stack_audio;   // audio processing stack
    mlt_deque stack_service; // general purpose stack
};
```

Frames carry **operations** (via stack) rather than pre-rendered data. The actual processing happens when `mlt_frame_get_image()` or `mlt_frame_get_audio()` is called.

### 3.2 Filters (Single-Stream Processing)

A filter modifies the output of a single producer without affecting the source.

**Source**: `src/framework/mlt_filter.h`

```c
struct mlt_filter_s {
    struct mlt_service_s parent;
    void (*close)(mlt_filter);
    mlt_frame (*process)(mlt_filter, mlt_frame);  // the processing function
    void *child;
};
```

**Key properties**:
- `track` - which track to apply to
- `in` / `out` - timing for the filter effect
- `disable` - keep filter in object model but don't process

### 3.3 Transitions (Two-Stream Processing)

A transition combines output from two producers.

**Source**: `src/framework/mlt_transition.h`

```c
struct mlt_transition_s {
    struct mlt_service_s parent;
    void (*close)(mlt_transition);
    mlt_frame (*process)(mlt_transition, mlt_frame a, mlt_frame b);  // combines two frames
    void *child;
    mlt_service producer;
    mlt_frame *frames;
    int held;
};
```

**Key properties**:
- `a_track` / `b_track` - which tracks to transition between
- `in` / `out` - timing of the transition
- `reverse` - reverse the transition direction

### 3.4 Properties System (Metadata Store)

All metadata is stored in a key-value properties system.

**Source**: `src/framework/mlt_properties.h`

```c
struct mlt_properties_s {
    void *child;
    void *local;
    mlt_destructor close;
    void *close_object;
};
```

Properties support:
- String, int, int64, double, position values
- Animation/keyframes via `mlt_properties_anim_*` functions
- Color values via `mlt_properties_set_color()`
- Nested properties via `mlt_properties_get_properties()`

---

## 4. MLT XML Format for Timeline Representation

### 4.1 Basic Structure

MLT XML represents the entire service graph:

```xml
<?xml version="1.0"?>
<mlt>
  <producer id="producer0">
    <property name="mlt_service">avformat</property>
    <property name="resource">clip1.mp4</property>
    <property name="in">100</property>
    <property name="out">199</property>
  </producer>
  
  <tractor>
    <multitrack>
      <track producer="video_track"/>
      <track producer="audio_track"/>
    </multitrack>
    <transition in="25" out="49" a_track="0" b_track="1">
      <property name="mlt_service">luma</property>
    </transition>
    <filter track="0">
      <property name="mlt_service">greyscale</property>
    </filter>
  </tractor>
</mlt>
```

**Source**: `demo/entity.mlt`, `demo/new.mlt`, `demo/pango.mlt`

### 4.2 Key Patterns

**Cuts with in/out points**:
```xml
<producer id="foo" in="100" out="149">
  <property name="resource">clip2.mpeg</property>
</producer>
```

**Playlist with entries and blanks**:
```xml
<playlist>
  <entry producer="foo" in="10" out="59"/>
  <blank length="25"/>
  <entry producer="bar" in="100" out="149"/>
</playlist>
```

**Multitrack with tracks**:
```xml
<multitrack>
  <track producer="title"/>
  <track producer="video"/>
</multitrack>
```

**Transitions with timing**:
```xml
<transition in="25" out="49" a_track="0" b_track="1">
  <property name="mlt_service">luma</property>
</transition>
```

**Filters with track targeting**:
```xml
<filter track="0">
  <property name="mlt_service">greyscale</property>
</filter>
```

---

## 5. Application to TypeScript Video Editor

### 5.1 Core Pattern: Metadata Over Mutation

The fundamental pattern is storing all edit decisions as metadata that references source files without modifying them:

```typescript
interface Producer {
  id: string;
  resource: string;        // path to source file
  in: number;              // start frame in source
  out: number;             // end frame in source
  length: number;          // total frames in source
  speed: number;           // playback speed
  filters: Filter[];       // processing operations
}

interface Cut extends Producer {
  cutParent: Producer;     // reference to original
}
```

### 5.2 Timeline Composition Model

```typescript
interface Track {
  producer: Producer;      // playlist of clips
}

interface Multitrack {
  tracks: Track[];         // parallel layers
}

interface Timeline {
  multitrack: Multitrack;
  transitions: Transition[];  // between tracks
  filters: Filter[];          // on tracks
}
```

### 5.3 Deferred Rendering

The timeline is a **graph** that is only evaluated when needed:

- **Preview**: Lightweight evaluation, skip encoding
- **Export**: Full evaluation with format conversion

```typescript
interface Consumer {
  type: 'preview' | 'export';
  format?: string;
  resolution?: { width: number; height: number };
  fps?: number;
}
```

### 5.4 Key Design Principles

1. **Source files are immutable** - All edits are metadata pointing to source frames
2. **Cuts are virtual** - In/out points define a view, not a copy
3. **Filters are composable** - Stack processing operations without nesting
4. **Transitions are track-aware** - Specify which tracks participate
5. **Lazy evaluation** - Only process what's needed for current output
6. **Properties are extensible** - Any service can carry arbitrary metadata

### 5.5 Comparison with MonetEDL

MLT's patterns map directly to MonetEDL:

| MLT Concept | MonetEDL Equivalent |
|-------------|---------------------|
| Producer | Source clip reference |
| Cut | Clip with in/out points |
| Playlist | Sequence of clips |
| Multitrack | Timeline tracks |
| Transition | Transition definition |
| Filter | Effect on clip/track |
| Tractor | Timeline container |
| Properties | Metadata store |

The key difference: MLT is a C library that processes frames in real-time, while MonetEDL is a JSON schema that describes the edit for deferred rendering.

---

## 6. Summary of Architectural Insights

### What MLT Gets Right

1. **Clean separation of concerns** - Producers generate data, consumers consume it, services process it
2. **Non-destructive by default** - Edits are metadata, not mutations
3. **Composable architecture** - Every service is also a producer (playlist → producer, multitrack → producer)
4. **Lazy evaluation** - Frames are processed on-demand via stack-based callbacks
5. **Properties as universal metadata** - Any service can carry arbitrary key-value data
6. **Track-aware transitions** - Transitions know which tracks they operate on

### Patterns to Adopt in TypeScript

1. **Reference, don't copy** - Source files stay on disk, edits reference frames
2. **Virtual cuts** - In/out points are metadata, not file operations
3. **Stack-based processing** - Accumulate operations, evaluate lazily
4. **Properties everywhere** - Use a Map<string, any> or similar for extensible metadata
5. **Graph-based evaluation** - Build a service graph, traverse it at render time
6. **Export as separate concern** - Preview and export use the same graph, different consumers

### File References

- `src/framework/mlt_service.h` - Base service class
- `src/framework/mlt_producer.h` - Producer (data origin)
- `src/framework/mlt_consumer.h` - Consumer (output destination)
- `src/framework/mlt_filter.h` - Filter (single-stream processing)
- `src/framework/mlt_transition.h` - Transition (two-stream processing)
- `src/framework/mlt_frame.h` - Frame (data carrier with processing stacks)
- `src/framework/mlt_playlist.h` - Playlist (sequential container)
- `src/framework/mlt_multitrack.h` - Multitrack (parallel container)
- `src/framework/mlt_tractor.h` - Tractor (timeline compositor)
- `src/framework/mlt_field.h` - Field (transitions/filters container)
- `src/framework/mlt_properties.h` - Properties (metadata store)
- `demo/new.mlt` - Example MLT XML with cuts and transitions
- `demo/pango.mlt` - Example with tractor and tracks
