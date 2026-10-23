# Hosted lesson video

Teacher-uploaded lesson video stored and streamed by a managed video provider (Mux), as opposed to a pasted external URL.

## Language

**Hosted video**:
A lesson video that a school uploads to the platform and that is streamed through signed playback, as opposed to an external video link.
_Avoid_: Mux video, uploaded video, internal video

**External video**:
A lesson video that is a link the teacher pasted (`video_url`), played from its own host.
_Avoid_: Legacy video, URL video

**Lesson media**:
The record tying one lesson to its hosted video and the video's processing state.
_Avoid_: Video row, asset row

**Upload**:
One attempt by a teacher to send a video file for a lesson, from request until the provider has the file.
_Avoid_: Ingest, transfer

**Processing**:
The period after an upload is received and before the hosted video can be played.
_Avoid_: Encoding, transcoding

**Ready**:
The state of a hosted video that has finished processing and can be played by authorized viewers.
_Avoid_: Published, available

**Playback grant**:
A short-lived signed permission for one viewer to stream one hosted video.
_Avoid_: Playback token, stream URL, signed URL

**Renewal**:
Replacing a playback grant with a fresh one during playback without interrupting the viewer.
_Avoid_: Refresh, re-mint

**Preview**:
An author or school admin watching a lesson, including unpublished ones, without an entitlement.
_Avoid_: Test playback

**School cap**:
The fixed per-school limit on hosted videos and total minutes, set by the platform.
_Avoid_: Quota, plan limit
