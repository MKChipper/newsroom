import SwiftUI
import WebKit

struct WebDashboardView: NSViewRepresentable {
  let url: URL

  func makeNSView(context: Context) -> WKWebView {
    let configuration = WKWebViewConfiguration()
    configuration.preferences.javaScriptCanOpenWindowsAutomatically = true
    let webView = WKWebView(frame: .zero, configuration: configuration)
    webView.allowsMagnification = true
    webView.load(URLRequest(url: url))
    return webView
  }

  func updateNSView(_ webView: WKWebView, context: Context) {
    if webView.url?.absoluteString != url.absoluteString {
      webView.load(URLRequest(url: url))
    }
  }
}
