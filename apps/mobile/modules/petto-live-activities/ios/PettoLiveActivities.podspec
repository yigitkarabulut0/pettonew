Pod::Spec.new do |s|
  s.name           = 'PettoLiveActivities'
  s.version        = '0.1.0'
  s.summary        = 'Petto iOS Live Activities bridge for ActivityKit.'
  s.description    = 'Exposes ActivityKit start/update/end and push token streams to JS.'
  s.author         = 'Petto'
  s.homepage       = 'https://petto.app'
  s.license        = 'MIT'
  # Match the host app's deployment target so use_expo_modules! doesn't
  # silently drop us with `pod.supports_platform? = false`. ActivityKit
  # API calls are guarded at the Swift level with @available(iOS 16.2, *),
  # so older iOS versions still link cleanly and just no-op the module.
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = '**/*.{h,m,swift}'
end
