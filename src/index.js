'use strict';

const ipcRenderer = window.ipcRenderer;

new Vue({
	el: "#app",
	data: {
		targetDirectory: '',
		configFile: '',
		log: '対象ディレクトリと設定ファイルを選択して、実行ボタンを押してください',
		isHowtoOpen: false
	},
	created: function () {
		let scope = this;

		ipcRenderer.on('openDirectory', (e, path) => {
			console.log(path)
			scope.targetDirectory = path;
		});
		ipcRenderer.on('openConfig', (e, path) => {
			scope.configFile = path;
		});
		ipcRenderer.on('log', (e, log) => {
			scope.log = log;
		});
	},
	methods: {
		openDirectory: function() {
			let scope = this;
			ipcRenderer.send('openDirectory');
		},
		openConfig: function() {
			let scope = this;
			ipcRenderer.send('openConfig');
		},
		exec: function() {
			let scope = this;
			if (scope.targetDirectory === '' || scope.configFile === '') {
				alert("対象ディレクトリと設定ファイルを指定してください");
				return;
			}
			if (confirm("よろしいですか？")) ipcRenderer.send('exec');

		},
		openHowto: function() {
			let scope = this;
			scope.isHowtoOpen = true;
		},
		closeHowto: function() {
			let scope = this;
			scope.isHowtoOpen = false;
		}
	}
})
