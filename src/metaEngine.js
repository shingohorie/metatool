'use strict';

const csv = require('csv-parser')
const fs = require('fs')
const rimraf = require("rimraf");
const newline = require('newline');
const ED = require('ensure-directory');
const detectNewline = require('detect-newline');

class MetaEngine {
	constructor(configPath, targetDir) {
		this.CONFIG_PATH = configPath;
		this.TARGET_DIR_PATH = targetDir;
		this.BACKUP_DIR_PATH = `${this.TARGET_DIR_PATH}/_bk`;
		this.results = [];
		this.logs = [];
	}

	exec() {
		let scope = this;

		return new Promise((resolve, reject) => {
			if (!fs.existsSync(scope.BACKUP_DIR_PATH)) {
				ED.ensureDirectory(scope.BACKUP_DIR_PATH).then(() => {
					resolve(scope.main());
				});
			} else {
				scope.addLog(`${scope.BACKUP_DIR_PATH}は既に存在しているため削除しました\n`);
				rimraf(scope.BACKUP_DIR_PATH, () => {
					resolve(scope.main())
				});
			}
		})
	}

	// main
	main() {
		let scope = this;
		return new Promise((resolve, reject) => {
			fs.createReadStream(scope.CONFIG_PATH)
				.pipe(csv({
					separator: "\t",
					trim: true
				}))
				.on('data', (data) => {
					console.log(data)
					scope.results.push(data);
				})
				.on('end',  () => {
					resolve(scope.readfile());
				});
		})
	}

	// パースされたCSVの情報をもとに１ファイルづつ処理
	readfile() {
		let scope = this;
		return new Promise((resolve, reject) => {
			const __readfile =  () => {
				if (scope.results.length) {
					let result = scope.results.shift();
					let file_path = scope.normalizeURL(result.URL);
					if (result.URL) delete (result.URL);
					if (result.NAME) delete (result.NAME);

					if (!fs.existsSync(`${scope.TARGET_DIR_PATH}/${file_path}`)) {
						scope.addLog(`ファイル ${scope.TARGET_DIR_PATH}/${file_path}は存在しませんでした\n`);
						__readfile();

					} else {
						fs.readFile(`${scope.TARGET_DIR_PATH}/${file_path}`, 'utf-8', (err, data) => {
							if (err) {
								__readfile();
							}
							let res = scope.insertMetadata(result, data, file_path);
							Promise.all([
								scope.outputBackupFile(file_path, res.backup_str),
								scope.outputNewFile(file_path, res.replaced_str)
							]).then(() => {
								if (res.log.length) scope.addLog(`${res.log.join("\n")}\n`);
								__readfile();
							});
						});
					}
				} else {
					scope.addLog(`全てのファイルに対する処理が完了しました`);
					resolve(scope.outputLog());
				}
			}
			__readfile();
		});
	}

	// わたされた情報をもとにmeta情報を挿入
	insertMetadata(result, data, file_path) {
		let scope = this;
		let backup_str = data, replaced_str, log = [];
		let lineBreakChar = detectNewline(backup_str);
		let _newline = lineBreakChar === '\n' ? 'LF' : lineBreakChar === '\r' ? 'CR' : 'CRLF';
		let isLogicalDeleted = result['論理削除フラグ'];

		if (isLogicalDeleted && parseInt(isLogicalDeleted) === 1) {
			log.push(`ファイル　${scope.TARGET_DIR_PATH}/${file_path}は論理削除フラグが立っているためスキップしました。`);

			return {
				backup_str: backup_str,
				replaced_str: backup_str,
				log: log
			}
		}

		Object.keys(result).forEach((key) => {
			let isMatch = false;
			let regexp;
			let _result = result[key];
			// 前後の改行と、データ中の二重引用符を削除
			_result = _result.trim().replace(/"/g, '');
			switch (key) {
				case 'title':
					regexp = new RegExp(`<(\\s*)title(\\s*)>(.*)<(\\s*)/title(\\s*)>`, 'i');
					isMatch = regexp.test(data);
					if (isMatch) {
						data = data.replace(regexp,  (match, p1, p2, p3, p4, p5, offset, string) => {
							return `<${p1}title${p2}>${_result}<${p4}/title${p5}>`;
						})
					}
					break;

				case 'og:site_name':
				case 'og:title':
				case 'og:description':
				case 'og:type':
				case 'og:url':
				case 'og:image':
				case 'og:locale':
					regexp = new RegExp(`<(\\s*)meta(\\s+)property="${key}"(\\s+)content="([^"]*)"(\\s*)(\\/?)>`, 'i');
					isMatch = regexp.test(data);
					if (isMatch) {
						data = data.replace(regexp,  (match, p1, p2, p3, p4, p5, p6, offset, string) => {
							return `<${p1}meta${p2}property="${key}"${p3}content="${_result}"${p5}${p6}>`;
						});
					}
					break;

				case 'description':
				case 'keywords':
				case 'twitter:card':
				case 'twitter:description':
					regexp = new RegExp(`<(\\s*)meta(\\s+)name="${key}"(\\s+)content="([^"]*)"(\\s*)(\\/?)>`, 'i');
					isMatch = regexp.test(data);
					if (isMatch) {
						data = data.replace(regexp,  (match, p1, p2, p3, p4, p5, p6, offset, string) => {
							return `<${p1}meta${p2}name="${key}"${p3}content="${_result}"${p5}${p6}>`;
						});
					}
					break;

				default:
					// class指定
					if (/^\.(.*)/.test(key)) {
						regexp = new RegExp(`<([^<>]*) class="([^"]*)${key.substring(1)}([^"]*)"([^>]*)>([^<>]*)</([^<>]*)>`, "gi");
						isMatch = regexp.test(data);
						if (isMatch) {
							data = data.replace(regexp, (match, p1, p2, p3, p4, p5, p6, offset, string) => {
								return `<${p1} class="${p2}${key.substring(1)}${p3}"${p4}>${_result}</${p6}>`;
							});
						}
					// id指定
					} else if (/^#(.*)/.test(key)) {
						regexp = new RegExp(`<(.*) id="${key.substring(1)}"([^>]*)>([^<>]*)</([^>]*)>`, "gi");
						regexp = new RegExp(`<([^<>]*) id="${key.substring(1)}"([^>]*)>([^<>]*)</([^<>]*)>`, "gi");
						isMatch = regexp.test(data);
						if (isMatch) {
							data = data.replace(regexp, (match, p1, p2, p3, p4, offset, string) => {
								return `<${p1} id="${key.substring(1)}"${p2}>${_result}</${p4}>`;
							});
						}
					// 正規表現
					} else if (/^\/(.*)\/[gimsuy]*$/.test(key)) {
						let _key = key.split("/").filter((e) => e );
						regexp = _key.length > 1 ? new RegExp(_key[0], _key[1]) : new RegExp(_key[0]);
						isMatch = regexp.test(data);
						if (isMatch) {
							data = data.replace(regexp, _result);
						}
					}
					break;
			}
			if (!isMatch) log.push(`ファイル　${scope.TARGET_DIR_PATH}/${file_path}に要素「${key}」は見つかりませんでした`);
		});

		// 改行コードをファイルと同様にする
		replaced_str = newline.set(data, _newline);

		return {
			backup_str: backup_str,
			replaced_str: replaced_str,
			log: log
		}
	}

	// URLをドキュメントルート（commandファイルの場所）からの相対パスに正規化
	normalizeURL(file_path) {
		if (!file_path || file_path === '') return 'undefided';
		if (/^\/$/.test(file_path)) file_path = 'index.html';
		if (/^\/(.*)/.test(file_path)) file_path = file_path.substring(1);
		if (/\/$/.test(file_path)) file_path = file_path + 'index.html';
		return file_path;
	}

	// バックアップファイルを作成
	outputBackupFile(file_path, backup_str) {
		let scope = this;

		return new Promise((resolve, reject) => {
			const backup_file_path = `${scope.BACKUP_DIR_PATH}/${file_path}`;
			const backup_dir_path = backup_file_path.substring(0, backup_file_path.lastIndexOf('/'));

			if (!fs.existsSync(backup_dir_path)) {
				ED.ensureDirectory(backup_dir_path).then(() => {
					fs.writeFile(backup_file_path, backup_str, (err) => {
						if (err) scope.addLog(`ファイル ${scope.TARGET_DIR_PATH}/${backup_file_path}を正しく作成できませんでした : ${err.message}\n`);
						resolve();
					});
				});
			} else {
				fs.writeFile(backup_file_path, backup_str, (err) => {
					if (err) scope.addLog(`ファイル ${scope.TARGET_DIR_PATH}/${backup_file_path}を正しく作成できませんでした : ${err.message}\n`);
					resolve();
				});
			}
		});
	}

	// meta情報挿入後のファイルを作成
	outputNewFile(file_path, replaced_str) {
		let scope = this;

		return new Promise((resolve, reject) => {
			fs.writeFile(`${scope.TARGET_DIR_PATH}/${file_path}`, replaced_str, (err) => {
				if (err) scope.addLog(`ファイル ${scope.TARGET_DIR_PATH}/${file_path}を正しく作成できませんでした : ${err.message}\n`);
				resolve();
			});
		});
	}

	// ログを追加する
	addLog(str) {
		let scope = this;
		scope.logs.push(str);
	}

	// ログを返す
	outputLog() {
		let scope = this;
		return scope.logs.join("\n");
	}
}

module.exports = MetaEngine;
