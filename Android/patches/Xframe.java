package com.visnalize.capacitor.plugins.xframe;

import android.webkit.WebResourceResponse;
import android.webkit.CookieManager;

import com.getcapacitor.JSObject;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;

import java.io.IOException;
import java.nio.charset.Charset;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.TimeUnit;

import okhttp3.ConnectionPool;
import okhttp3.Headers;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.ResponseBody;

public class Xframe {
    OkHttpClient client = new OkHttpClient.Builder()
            .connectionPool(new ConnectionPool(10, 5, TimeUnit.MINUTES))
            .followRedirects(false)
            .followSslRedirects(false)
            .build();

    public Response request(String url, String method, Map<String, String> headers, RequestBody body) throws IOException {
        Headers.Builder headersBuilder = new Headers.Builder();
        if (headers != null) {
            for (Map.Entry<String, String> entry : headers.entrySet()) {
                try {
                    if (entry.getKey() != null && entry.getValue() != null) {
                        headersBuilder.add(entry.getKey(), entry.getValue());
                    }
                } catch (IllegalArgumentException e) {
                    // Ignore malformed headers
                }
            }
        }

        // Cookie Sync: Read cookies from Android's WebView and add them to OkHttp request
        try {
            String cookie = CookieManager.getInstance().getCookie(url);
            if (cookie != null && !cookie.isEmpty()) {
                headersBuilder.add("Cookie", cookie);
            }
        } catch (Exception e) {
            // Ignore cookie retrieval errors
        }

        Request _request = new Request.Builder()
                .headers(headersBuilder.build())
                .url(url)
                .method(method, body)
                .build();

        Response response = client.newCall(_request).execute();

        // Cookie Sync: Save Set-Cookie headers from OkHttp response back to Android's WebView
        try {
            Headers responseHeaders = response.headers();
            for (String headerName : responseHeaders.names()) {
                if (headerName.equalsIgnoreCase("Set-Cookie")) {
                    for (String cookieValue : responseHeaders.values(headerName)) {
                        CookieManager.getInstance().setCookie(url, cookieValue);
                    }
                }
            }
            CookieManager.getInstance().flush();
        } catch (Exception e) {
            // Ignore cookie saving errors
        }

        Response.Builder responseBuilder = response.newBuilder();
        
        // Strip X-Frame and CSP headers case-insensitively
        responseBuilder.removeHeader("X-Frame-Options");
        responseBuilder.removeHeader("Content-Security-Policy");
        responseBuilder.removeHeader("x-frame-options");
        responseBuilder.removeHeader("content-security-policy");
        responseBuilder.removeHeader("content-security-policy-report-only");
        responseBuilder.removeHeader("x-content-security-policy");
        responseBuilder.removeHeader("x-webkit-csp");

        return responseBuilder.build();
    }

    public WebResourceResponse transform(Response response) {
        Map<String, String> responseHeaders = new HashMap<>();
        for (String headerName : response.headers().names()) {
            responseHeaders.put(headerName, response.header(headerName));
        }

        return new WebResourceResponse(
                getMimeType(response),
                getEncoding(response),
                response.code(),
                response.message().isEmpty() ? "OK" : response.message(),
                responseHeaders,
                response.body() != null ? response.body().byteStream() : null
        );
    }

    protected Charset getCharset(Response response) {
        MediaType responseType = getResponseType(response);
        if (responseType == null) return Charset.forName("UTF-8");
        Charset charset = responseType.charset();
        return charset == null ? Charset.forName("UTF-8") : charset;
    }

    public WebResourceResponse transformAndInject(Response response, String script) {
        Map<String, String> responseHeaders = new HashMap<>();
        for (String headerName : response.headers().names()) {
            responseHeaders.put(headerName, response.header(headerName));
        }

        try {
            String html = response.body().string();
            String injectedHtml;
            if (html.contains("</body>")) {
                injectedHtml = html.replace("</body>", script + "</body>");
            } else {
                injectedHtml = html + script;
            }
            byte[] bytes = injectedHtml.getBytes(getCharset(response));
            java.io.ByteArrayInputStream stream = new java.io.ByteArrayInputStream(bytes);

            return new WebResourceResponse(
                    "text/html",
                    getEncoding(response),
                    response.code(),
                    response.message().isEmpty() ? "OK" : response.message(),
                    responseHeaders,
                    stream
            );
        } catch (Exception e) {
            return transform(response);
        }
    }

    public JSObject getDocumentData(Response response, String requestUrl) throws IOException {
        // as the response body can only be consumed once,
        // use `peekBody` to create a copy to work around this limitation
        ResponseBody responseBody = response.peekBody(1024 * 1024); // peek only the first 1MB for memory safety
        Document doc = Jsoup.parse(responseBody.byteStream(), null, requestUrl);
        Element faviconElem = doc.head().selectFirst("[rel='icon'], [rel='shortcut icon']");

        JSObject result = new JSObject();
        result.put("url", requestUrl);
        result.put("title", doc.title());
        result.put("favicon", faviconElem == null ? "" : faviconElem.attr("abs:href"));
        return result;
    }

    public JSObject getResponseError(Response response, String requestUrl) {
        JSObject result = new JSObject();
        result.put("url", requestUrl);
        result.put("statusCode", response.code());
        result.put("message", response.message());
        return result;
    }

    public JSObject getGenericError(String requestUrl) {
        JSObject result = new JSObject();
        result.put("url", requestUrl);
        return result;
    }

    protected String getEncoding(Response response) {
        MediaType responseType = getResponseType(response);
        if (responseType == null) return "";
        Charset charset = responseType.charset();
        return charset == null ? "" : charset.toString();
    }

    protected String getMimeType(Response response) {
        MediaType responseType = getResponseType(response);
        return responseType == null ? "" : responseType.type() + "/" + responseType.subtype();
    }

    private MediaType getResponseType(Response response) {
        return response.body() != null ? response.body().contentType() : null;
    }
}
