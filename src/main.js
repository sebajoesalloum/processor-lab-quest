/* Start-up: runs after every UI module has defined its views. */
setLv('b');
go('over');
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  $('#intro').style.display = 'none';
} else {
  iPlay();
}
