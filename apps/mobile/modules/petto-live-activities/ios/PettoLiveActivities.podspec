Pod::Spec.new do |s|
  s.name           = 'PettoLiveActivities'
  s.version        = '0.1.0'
  s.summary        = 'Petto iOS Live Activities bridge for ActivityKit.'
  s.description    = 'Exposes ActivityKit start/update/end and push token streams to JS.'
  s.author         = 'Petto'
  s.homepage       = 'https://petto.app'
  s.license        = 'MIT'
  s.platforms      = { :ios => '16.2' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = '**/*.{h,m,swift}'
end
