ipc = require 'ipc'
app = require 'app'
webContents = require 'web-contents'
v8Util = process.atomBinding 'v8_util'
webViewManager = null  # Doesn't exist in early initialization.

supportedWebViewEvents = [
  'load-commit'
  'did-finish-load'
  'did-fail-load'
  'did-frame-finish-load'
  'did-start-loading'
  'did-stop-loading'
  'did-get-response-details'
  'did-get-redirect-request'
  'dom-ready'
  'console-message'
  'new-window'
  'close'
  'crashed'
  'gpu-crashed'
  'plugin-crashed'
  'destroyed'
  'page-title-set'
  'page-favicon-updated'
  'enter-html-full-screen'
  'leave-html-full-screen'
]

nextInstanceId = 0
guestInstances = {}
embedderElementsMap = {}
reverseEmbedderElementsMap = {}

# Moves the last element of array to the first one.
moveLastToFirst = (list) ->
  list.unshift list.pop()

# Generate guestInstanceId.
getNextInstanceId = (webContents) ->
  ++nextInstanceId

# Destroy guest when the embedder is gone or navigated.
destroyEvents = ['destroyed', 'crashed', 'did-navigate-to-different-page']

attachEmbedderToGuest = (embedder, id) ->
  destroy = guestInstances[id].destroy
  for event in destroyEvents
    embedder.once event, destroy
    # Users might also listen to the crashed event, so We must ensure the guest
    # is destroyed before users' listener gets called. It is done by moving our
    # listener to the first one in queue.
    listeners = embedder._events[event]
    moveLastToFirst listeners if Array.isArray listeners

detachEmbedderFromGuest = (id) ->
  destroy = guestInstances[id].destroy
  embedder = guestInstances[id].embedder
  embedder.removeListener event, destroy for event in destroyEvents

# Create a new guest instance.
createGuest = (embedder, params) ->
  webViewManager ?= process.atomBinding 'web_view_manager'

  id = getNextInstanceId embedder
  guest = webContents.create {isGuest: true, partition: params.partition, embedder}

  destroy = ->
    destroyGuest id if guestInstances[id]?

  guestInstances[id] = {guest, embedder, destroy}

  attachEmbedderToGuest embedder, id

  guest.once 'destroyed', ->
    detachEmbedderFromGuest id

  # Init guest web view after attached.
  guest.once 'did-attach', ->
    params = @attachParams
    delete @attachParams

    @viewInstanceId = params.instanceId
    @setSize
      normal:
        width: params.elementWidth, height: params.elementHeight
      enableAutoSize: params.autosize
      min:
        width: params.minwidth, height: params.minheight
      max:
        width: params.maxwidth, height: params.maxheight

    if params.src
      opts = {}
      opts.httpReferrer = params.httpreferrer if params.httpreferrer
      opts.userAgent = params.useragent if params.useragent
      @loadUrl params.src, opts

    if params.allowtransparency?
      @setAllowTransparency params.allowtransparency

    guest.allowPopups = params.allowpopups

  # Dispatch events to embedder.
  for event in supportedWebViewEvents
    do (event) ->
      guest.on event, (_, args...) ->
        guestInstances[id]?.embedder.send "ATOM_SHELL_GUEST_VIEW_INTERNAL_DISPATCH_EVENT-#{guest.viewInstanceId}", event, args...

  # Dispatch guest's IPC messages to embedder.
  guest.on 'ipc-message-host', (_, packed) ->
    [channel, args...] = packed
    guestInstances[id]?.embedder.send "ATOM_SHELL_GUEST_VIEW_INTERNAL_IPC_MESSAGE-#{guest.viewInstanceId}", channel, args...

  # Autosize.
  guest.on 'size-changed', (_, args...) ->
    guestInstances[id]?.embedder.send "ATOM_SHELL_GUEST_VIEW_INTERNAL_SIZE_CHANGED-#{guest.viewInstanceId}", args...

  id

# Attach the guest to an element of embedder.
attachGuest = (embedder, elementInstanceId, guestInstanceId, params) ->
  guest = guestInstances[guestInstanceId].guest

  currentEmbedder = guestInstances[guestInstanceId].embedder

  # Remove old embedder when switching over
  if currentEmbedder != embedder
    webViewManager.removeGuest currentEmbedder, guestInstanceId

    key = reverseEmbedderElementsMap[guestInstanceId]
    if key?
      delete reverseEmbedderElementsMap[guestInstanceId]
      delete embedderElementsMap[key]

    detachEmbedderFromGuest guestInstanceId
    guest._setEmbedder(embedder);
    guestInstances[guestInstanceId].embedder = embedder
    attachEmbedderToGuest embedder, guestInstanceId

  # Destroy the old guest when attaching.
  key = "#{embedder.getId()}-#{elementInstanceId}"
  oldGuestInstanceId = embedderElementsMap[key]
  if oldGuestInstanceId?
    # Reattachment to the same guest is not currently supported.
    return unless oldGuestInstanceId != guestInstanceId

    return unless guestInstances[oldGuestInstanceId]?
    destroyGuest oldGuestInstanceId

  webPreferences =
    'guest-instance-id': guestInstanceId
    'node-integration': params.nodeintegration ? false
    'plugins': params.plugins
    'web-security': !params.disablewebsecurity
  webPreferences['preload-url'] = params.preload if params.preload
  webViewManager.addGuest guestInstanceId, elementInstanceId, embedder, guest, webPreferences

  guest.attachParams = params
  embedderElementsMap[key] = guestInstanceId
  reverseEmbedderElementsMap[guestInstanceId] = key

# Destroy an existing guest instance.
destroyGuest = (id) ->
  embedder = guestInstances[id].embedder
  webViewManager.removeGuest embedder, id
  guestInstances[id].guest.destroy()
  delete guestInstances[id]

  key = reverseEmbedderElementsMap[id]
  if key?
    delete reverseEmbedderElementsMap[id]
    delete embedderElementsMap[key]

transferGuest = (sourceWebViewRef, targetWebViewRef) ->
  return unless sourceWebViewRef && targetWebViewRef

  source = v8Util.getHiddenValue sourceWebViewRef, 'internal'
  target = v8Util.getHiddenValue targetWebViewRef, 'internal'
  return unless source.transferable() && target.isAlive()

  key = "#{source.embedder.getId()}-#{source.internalInstanceId}"
  guestInstanceId = embedderElementsMap[key]
  return unless guestInstanceId

  url = guestInstances[guestInstanceId].guest.getUrl()

  source.embedder.send "ATOM_SHELL_GUEST_VIEW_DETACH-#{source.viewInstanceId}"
  target.embedder.send "ATOM_SHELL_GUEST_VIEW_ATTACH-#{target.viewInstanceId}", guestInstanceId, url

ipc.on 'ATOM_SHELL_GUEST_VIEW_MANAGER_CREATE_GUEST', (event, params, requestId) ->
  event.sender.send "ATOM_SHELL_RESPONSE_#{requestId}", createGuest(event.sender, params)

ipc.on 'ATOM_SHELL_GUEST_VIEW_MANAGER_ATTACH_GUEST', (event, elementInstanceId, guestInstanceId, params) ->
  attachGuest event.sender, elementInstanceId, guestInstanceId, params

ipc.on 'ATOM_SHELL_GUEST_VIEW_MANAGER_DESTROY_GUEST', (event, id) ->
  destroyGuest id

ipc.on 'ATOM_SHELL_GUEST_VIEW_MANAGER_SET_SIZE', (event, id, params) ->
  guestInstances[id]?.guest.setSize params

ipc.on 'ATOM_SHELL_GUEST_VIEW_MANAGER_SET_ALLOW_TRANSPARENCY', (event, id, allowtransparency) ->
  guestInstances[id]?.guest.setAllowTransparency allowtransparency

app.once 'ATOM_SHELL_GUEST_VIEW_MANAGER_TRANSFER', (source, target) ->
  transferGuest(source, target);

# Returns WebContents from its guest id.
exports.getGuest = (id) ->
  guestInstances[id]?.guest

# Returns the embedder of the guest.
exports.getEmbedder = (id) ->
  guestInstances[id]?.embedder
