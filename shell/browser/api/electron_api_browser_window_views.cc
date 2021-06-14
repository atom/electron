// Copyright (c) 2018 GitHub, Inc.
// Use of this source code is governed by the MIT license that can be
// found in the LICENSE file.

#include "shell/browser/api/electron_api_browser_window.h"

#include "shell/browser/native_window_views.h"
#include "ui/aura/window.h"

namespace electron {

namespace api {

void BrowserWindow::UpdateDraggableRegions(
    const std::vector<mojom::DraggableRegionPtr>& regions) {
  if (window_->has_frame())
    return;

  if (&draggable_regions_ != &regions) {
    auto const offset =
        web_contents()->GetNativeView()->GetBoundsInRootWindow();
    auto snapped_regions = mojo::Clone(regions);
    for (auto& snapped_region : snapped_regions) {
      snapped_region->bounds.Offset(offset.x(), offset.y());
    }

    draggable_regions_ = mojo::Clone(snapped_regions);
  }

  static_cast<NativeWindowViews*>(window_.get())
      ->UpdateDraggableRegions(draggable_regions_);
}

}  // namespace api

}  // namespace electron
