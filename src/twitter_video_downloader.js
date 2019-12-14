function processBlobVideo(id, readableName) {
    chrome.storage.sync.get({
        isVideoSaveAsTS: true,
        isVideoSaveAsMP4: true,
    }, (items) => {
        if (items.isVideoSaveAsTS) {
            chrome.runtime.sendMessage({
                type: 'preprocessComplexTsVideo',
                id: id,
                ct0: getCookie("ct0"),
                readableName: readableName
            })
        }

        if (items.isVideoSaveAsMP4) {
            chrome.runtime.sendMessage({
                type: 'processComplexMp4Video',
                id: id,
                ct0: getCookie("ct0"),
                readableName: readableName
            })
        }
    });
}

function processGifVideo(url, readableName) {
    chrome.storage.sync.get({
        isConvertGIF: true,
        isSaveMP4: true,
    }, (items) => {
        if (items.isConvertGIF) {
            chrome.runtime.sendMessage({
                type: 'gif',
                url: url,
                readableName: readableName
            });
        }

        if (items.isSaveMP4) {
            chrome.runtime.sendMessage({
                type: 'mp4Video',
                url: url,
                readableName: readableName
            });
        }
    });
}

async function preprocessComplexTsVideo(id, ct0, readableName) {
    var jsonUrl = "https://api.twitter.com/1.1/videos/tweet/config/";
    jsonUrl += id + ".json";

    var playlistUrl = await getPlaylistUrl(jsonUrl, ct0);

    processComplexTsVideo(playlistUrl, readableName);
}

async function processComplexTsVideo(playlistUrl, readableName) {
    var filename = playlistUrl.substring(playlistUrl.lastIndexOf('/') + 1).split(".")[0];
    var palylist = await getMaximumBandwidthPlaylist(playlistUrl);
    var videoUrls = await getVideoFileUrls(palylist);
    var videoData = await accumTsFragment(videoUrls);
    downloadTsVideo(videoData, filename, readableName)
}

async function processComplexMp4Video(id, ct0, readableName) {
    var pageUrl = "https://api.twitter.com/1.1/statuses/show.json?include_profile_interstitial_type=1&include_blocking=1&include_blocked_by=1&include_followed_by=1&include_want_retweets=1&include_mute_edge=1&include_can_dm=1&skip_status=1&cards_platform=Web-12&include_cards=1&include_ext_alt_text=true&include_reply_count=1&tweet_mode=extended&trim_user=false&include_ext_media_color=true&id=" + id;
    var mp4Url = await getMp4Url(pageUrl, ct0);

    downloadMp4Video(mp4Url, readableName);
}

function processImageDownload(src, readableName) {
    chrome.runtime.sendMessage({
        type: 'image',
        readableName: readableName,
        url: src
    });
}

function getMp4Url(url, ct0) {
    return new Promise((resolve, reject) => {
        var init = {
            origin: 'https://mobile.twitter.com',
            headers: {
                "Accept": '*/*',
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:62.0) Gecko/20100101 Firefox/62.0",
                "authorization": "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA",
                "x-csrf-token": ct0
            },
            credentials: 'include',
            referrer: 'https://mobile.twitter.com'
        };

        fetch(url, init)
            .then((response) => {
                if (response.status == 200) {
                    response.json().then((json) => {
                        let mp4Variants = json.extended_entities.media[0].video_info.variants.filter(variant => variant.content_type === 'video/mp4')
                        mp4Variants = mp4Variants.sort((a, b) => (b.bitrate - a.bitrate))

                        let url = ''
                        if (mp4Variants.length) {
                            url = mp4Variants[0].url
                        }
                        resolve(url);
                    })
                } else {
                    reject({
                        status: response.status,
                        statusText: response.statusText
                    });
                }
            })
            .catch((err) => {
                reject({
                    error: err
                });
            });
    });
}

function getPlaylistUrl(url, ct0) {
    return new Promise((resolve, reject) => {
        var init = {
            method: 'GET',
            mode: 'cors',
            origin: 'https://twitter.com',
            headers: {
                "Accept": '*/*',
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:62.0) Gecko/20100101 Firefox/62.0",
                "authorization": "Bearer AAAAAAAAAAAAAAAAAAAAAPYXBAAAAAAACLXUNDekMxqa8h%2F40K4moUkGsoc%3DTYfbDKbT3jJPCEVnMYqilB28NHfOPqkca3qaAxGfsyKCs0wRbw",
                "x-csrf-token": ct0
            },
            credentials: 'include',
            referrer: 'https://twitter.com'
        };

        fetch(url, init)
            .then((response) => {
                if (response.status == 200) {
                    response.json().then((data) => {
                        var platlistUrl = data["track"]["playbackUrl"];
                        resolve(platlistUrl);
                    });
                } else {
                    reject({
                        status: response.status,
                        statusText: response.statusText
                    });
                }
            })
            .catch((err) => {
                reject({
                    error: err
                });
            });
    });
}

function getMaximumBandwidthPlaylist(url) {
    return new Promise((resolve, reject) => {
        fetch(url)
            .then(
                (response) => {
                    if (response.status == 200) {
                        response.text().then((text) => {
                            resolve(findMaxBandwidthSource(text));
                        })
                    } else {
                        reject({
                            status: response.status,
                            statusText: response.statusText
                        });
                    }
                }
            )
            .catch((err) => {
                reject({
                    error: err
                });
            });
    });
}

function getVideoFileUrls(url) {
    return new Promise((resolve, reject) => {
        fetch(url)
            .then(
                (response) => {
                    if (response.status == 200) {
                        response.text().then((text) => {
                            resolve(parseVideoUrls(text));
                        })
                    } else {
                        reject({
                            status: response.status,
                            statusText: response.statusText
                        });
                    }
                }
            )
            .catch((err) => {
                reject({
                    error: err
                });
            });
    });

}

async function accumTsFragment(videoUrls) {
    var videoBuffer = new Uint8Array(0);

    for (var i in videoUrls) {
        var fragment = await downloadTsFragment(videoUrls[i]);
        videoBuffer = mergeFragment(videoBuffer, fragment);
    }

    return videoBuffer;
}

function downloadTsFragment(urlTs) {
    return new Promise((resolve, reject) => {
        fetch(urlTs)
            .then((response) => response.arrayBuffer())
            .then((buffer) => {
                resolve(buffer);
            })
            .catch((err) => {
                reject({
                    error: err
                });
            });
    });
}

function mergeFragment(buffer, fragment) {
    var now = new Uint8Array(fragment);
    var prev = new Uint8Array(buffer);

    var merged = new Uint8Array(now.length + prev.length);
    merged.set(prev);
    merged.set(now, prev.length);

    return merged
}

function downloadTsVideo(data, tsFilename, readableName) {
    chrome.storage.sync.get({
        spcificPathName: false,
        readableName: false
    }, (items) => {
        var blob = new Blob([data], {
            type: 'video/mp2t'
        });
        var url = URL.createObjectURL(blob);

        let options = {
            url: url,
            saveAs: items.spcificPathName,
            filename: tsFilename + ".ts"
        }

        if (items.readableName) {
            options.filename = readableName + '.ts'
        }

        chrome.downloads.download(options);
    });
}

function fileExtension(url) {
    const splited = url.split('.')
    return splited[splited.length - 1].split('?')[0]
}

function downloadMp4Video(url, readableName) {
    chrome.storage.sync.get({
        spcificPathName: false,
        readableName: false
    }, (items) => {
        let options = {
            url: url,
            saveAs: items.spcificPathName
        }

        if (items.readableName) {
            options.filename = readableName + '.' + fileExtension(url)
        }

        chrome.downloads.download(options);
    });
}

function downloadImage(url, readableName) {
    chrome.storage.sync.get({
        spcificPathName: false,
        readableName: false
    }, (items) => {
        const uploadedImageQuery = /https:\/\/pbs.twimg.com\/media\/(.*)?\?.*/g;
        const extensionAttributeQuery = /(?:\?|\&)format\=([^&]+)/g;

        const nameMatches = uploadedImageQuery.exec(url)
        const formatMatches = extensionAttributeQuery.exec(url)

        let options = {
            url: url,
            saveAs: items.spcificPathName
        }

        let filename = 'no_title'

        if (nameMatches.length) {
            filename = nameMatches[1]
        }

        if (items.readableName) {
            filename = readableName
        }

        if (formatMatches.length) {
            const format = formatMatches[1]
            options.filename = `${filename}.${format}`
        }

        chrome.downloads.download(options);
    });
}

function getCookie(cname) {
    var name = cname + "=";
    var decodedCookie = decodeURIComponent(document.cookie);
    var ca = decodedCookie.split(';');
    for (var i = 0; i < ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) == ' ') {
            c = c.substring(1);
        }
        if (c.indexOf(name) == 0) {
            return c.substring(name.length, c.length);
        }
    }
    return "";
}

function findMaxBandwidthSource(string) {
    var stringsSplited = string.split("#");
    var arrBandwidth = [];
    for (var i in stringsSplited) {
        var bandwidth = findBandwidth(stringsSplited[i]);
        if (bandwidth > 0) {
            arrBandwidth.push(bandwidth);
        }
    }

    var bandwidthMax = Math.max.apply(null, arrBandwidth);
    for (var i in stringsSplited) {
        if (bandwidthMax == findBandwidth(stringsSplited[i])) {
            return findPlaylistSource(stringsSplited[i]);
        }
    }
    return "";
}

function findBandwidth(sourcePlaylist) {
    var stringsSplited = sourcePlaylist.split(",");
    for (var i in stringsSplited) {
        if (stringsSplited[i].search("BANDWIDTH") == 0) {
            return Number(stringsSplited[i].split("=")[1]);
        }
    }
    return -1;
}

function findPlaylistSource(sourcePlaylist) {
    var stringsSplited = sourcePlaylist.split("\n");
    for (var i in stringsSplited) {
        if (((stringsSplited[i].search("ext_tw_video") > 0) || (stringsSplited[i].search("amplify_video") > 0)) && (stringsSplited[i].search("m3u8") > 0)) {
            return "https://video.twimg.com" + stringsSplited[i];
        }
    }
    return "";
}

function parseVideoUrls(string) {
    var stringsSplited = string.split("#");
    var arrPlaylist = [];
    for (var i in stringsSplited) {
        if ((stringsSplited[i].search("ext_tw_video") > 0) || (stringsSplited[i].search("amplify_video") > 0)) {
            arrPlaylist.push("https://video.twimg.com" + stringsSplited[i].split("\n")[1]);
        }
    }
    return arrPlaylist;
}