import * as yo from 'yo-yo'
// Render the list of scripts in the dropdown
export default function (postscript) {
  return yo`
    <li>
      <div class="list-item">
          <div style="display: inline-block" title=${postscript.postscriptName}}></div>
          <div style="display: inline-block">
            <span> <b>${postscript.postscriptInfo}</b></span>
          </div>
      </div>
    </li>
  `
}
